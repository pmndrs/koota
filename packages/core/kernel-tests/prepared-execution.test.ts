import { afterEach, describe, expect, it } from 'vitest';
import * as kernel from '../src/kernel';

const contexts: kernel.KernelContext[] = [];
function context(excluded?: readonly kernel.Trait[]) {
  const ctx = kernel.createKernelContext(excluded);
  kernel.initializeKernel(ctx);
  contexts.push(ctx);
  return ctx;
}
afterEach(() => {
  for (const ctx of contexts) kernel.destroyKernel(ctx);
  contexts.length = 0;
});

function collect(plan: kernel.QueryPlan) {
  const values = new Uint32Array(4096);
  const count = kernel.collectQueryPlanInto(plan, values);
  expect(count).toBeGreaterThanOrEqual(0);
  return Array.from(values.subarray(0, count)).sort((a, b) => a - b);
}

describe('prepared entity execution', () => {
  it.each(['numeric', 'prepared'])('publishes %s pair writes before deferred removal', (mode) => {
    const ctx = context();
    const events: number[] = [];
    const target = kernel.createEntity(ctx);
    const relation = kernel.createRelation({
      store: { weight: 0 },
      hooks: {
        onSet(value, entity, observedTarget) {
          expect(observedTarget).toBe(target);
          events.push(value.weight);
          value.weight++;
          kernel.detachEntity(ctx, entity, pair);
        },
        onRemove(value) {
          events.push(value.weight);
        },
      },
    });
    const pair = kernel.pairEntity(ctx, kernel.resolveDefinition(ctx, relation), target);
    const access = kernel.prepareEntityAccess(ctx, pair);
    kernel.reserveKernel(ctx, 16, 16);
    const entity = kernel.tryCreateEntity(ctx);
    kernel.tryAttachPrepared(access, entity);
    const write = (input: number[]) =>
      mode === 'numeric'
        ? kernel.writeEntityValues(ctx, entity, pair, input)
        : kernel.writePreparedValues(access, entity, input);
    expect(write([])).toBe(false);
    expect(events).toEqual([]);
    expect(write([2.5])).toBe(true);
    expect(events).toEqual([2.5, 3.5]);
    expect(kernel.hasEntityTrait(ctx, entity, pair)).toBe(false);
    expect(write([9])).toBe(false);
    expect(events).toEqual([2.5, 3.5]);
  });

  it('uses direct scalar and pair access while preserving identity and lifecycle behavior', () => {
    const ctx = context();
    const value = kernel.defineTrait(ctx, { x: 0, label: '' });
    const link = kernel.defineRelation(ctx, { store: { weight: 1 } });
    const target = kernel.createEntity(ctx);
    const pair = kernel.pairEntity(ctx, link, target);
    const scalarAccess = kernel.prepareEntityAccess(ctx, value);
    const pairAccess = kernel.prepareEntityAccess(ctx, pair);
    expect(kernel.prepareEntityAccess(ctx, value)).toBe(scalarAccess);
    kernel.reserveKernel(ctx, 32, 64);
    const entity = kernel.tryCreateEntity(ctx);
    expect(kernel.tryAttachPrepared(scalarAccess, entity, { x: 1.5, label: 'first' })).toBe(1);
    expect(kernel.tryAttachPrepared(scalarAccess, entity)).toBe(0);
    expect(kernel.tryAttachPrepared(pairAccess, entity)).toBe(1);
    const output: any[] = [0, ''];
    expect(kernel.readPreparedValues(scalarAccess, entity, output)).toBe(2);
    expect(output).toEqual([1.5, 'first']);
    expect(kernel.writePreparedValues(scalarAccess, entity, [7.5])).toBe(false);
    expect(kernel.writePreparedValues(scalarAccess, entity, [7.5, 'second'])).toBe(true);
    expect(kernel.readEntityTrait(ctx, entity, value)).toEqual({ x: 7.5, label: 'second' });
    expect(kernel.writePreparedValues(pairAccess, entity, [2.5])).toBe(true);
    expect(kernel.readEntityTrait(ctx, entity, pair)).toEqual({ weight: 2.5 });
    const foreign = kernel.createEntity(context());
    expect(kernel.hasPreparedTrait(scalarAccess, foreign)).toBe(false);
    expect(kernel.writePreparedValues(pairAccess, foreign, [9])).toBe(false);
    kernel.destroyEntity(ctx, target);
    expect(kernel.readPreparedValues(pairAccess, entity, output)).toBe(-1);
    expect(kernel.tryAttachPrepared(pairAccess, entity)).toBe(-2);
    expect(kernel.detachPrepared(scalarAccess, entity)).toBe(true);
    expect(kernel.detachPrepared(scalarAccess, entity)).toBe(false);
    expect(kernel.readPreparedValues(scalarAccess, entity, output)).toBe(-1);
  });

  it('reports unprepared storage and membership exhaustion before attaching', () => {
    const ctx = context();
    const entity = kernel.createEntity(ctx);
    const value = kernel.defineTrait(ctx, { x: 0 });
    const access = kernel.prepareEntityAccess(ctx, value);
    expect(kernel.tryAttachPrepared(access, entity)).toBe(-1);
    kernel.reserveKernel(ctx, 512, 256);
    const entities = new Uint32Array(256);
    const spawn = kernel.prepareSpawnPlan(ctx, [value]);
    expect(kernel.trySpawnBatch(spawn, entities)).toBe(256);
    expect(kernel.tryAttachPrepared(access, entity)).toBe(-1);
    expect(kernel.hasPreparedTrait(access, entity)).toBe(false);
    expect(kernel.detachPrepared(access, entities[0])).toBe(true);
    expect(kernel.tryAttachPrepared(access, entity)).toBe(1);
  });

  it('keeps prepared definition identities invalid after replacement and reset', () => {
    const ctx = context();
    const blueprint = kernel.createTrait({ x: 1 });
    const predicate = kernel.resolveDefinition(ctx, blueprint);
    const access = kernel.prepareEntityAccess(ctx, predicate);
    const query = kernel.prepareQueryPlan(ctx, [predicate]);
    const spawn = kernel.prepareSpawnPlan(ctx, [predicate]);
    kernel.destroyEntity(ctx, predicate);
    const replacement = kernel.resolveDefinition(ctx, blueprint);
    expect(replacement).not.toBe(predicate);
    expect(kernel.collectQueryPlanInto(query, [])).toBe(-1);
    expect(kernel.trySpawnBatch(spawn, new Uint32Array(1))).toBe(-1);
    expect(kernel.hasPreparedTrait(access, kernel.createEntity(ctx))).toBe(false);
    const empty = kernel.prepareQueryPlan(ctx, []);
    kernel.resetKernel(ctx);
    expect(kernel.isQueryPlanValid(empty)).toBe(false);
  });
});

describe('indexed and streaming queries', () => {
  it('refreshes empty plans when entities become visible and invalidates released resources', () => {
    const ctx = context();
    const plan = kernel.prepareQueryPlan(ctx, []);
    const workspace = kernel.createQueryWorkspace(8);
    const seen: number[] = [];
    const read = (entities: Readonly<ArrayLike<number>>, count: number) => {
      seen.length = 0;
      for (let i = 0; i < count; i++) seen.push(entities[i]);
    };
    expect(kernel.visitQueryPlan(plan, workspace, read)).toBe(0);
    const entity = kernel.createEntity(ctx);
    const blueprint = kernel.createTrait();
    kernel.addTrait(ctx, entity, blueprint);
    expect(kernel.visitQueryPlan(plan, workspace, read)).toBe(1);
    expect(seen).toEqual([entity]);
    const definition = kernel.resolveDefinition(ctx, blueprint);
    expect(kernel.visitQueryPlan(plan, workspace, read)).toBe(2);
    expect(seen).toContain(definition);
    kernel.destroyEntity(ctx, entity);
    expect(kernel.visitQueryPlan(plan, workspace, read)).toBe(1);
    expect(seen).toEqual([definition]);
    const spawn = kernel.prepareSpawnPlan(ctx, []);
    kernel.releaseKernelResources(kernel.getKernelCleanupToken(ctx));
    expect(kernel.visitQueryPlan(plan, workspace, read)).toBe(-1);
    expect(kernel.trySpawnBatch(spawn, [])).toBe(-1);
  });

  it('finds selective memberships through churn and preserves cached-query ordering', () => {
    const ctx = context();
    const common = kernel.defineTrait(ctx);
    const rare = kernel.defineTrait(ctx);
    const entities = Array.from({ length: 200 }, () => kernel.createEntity(ctx));
    for (const entity of entities) kernel.attachEntity(ctx, entity, common);
    for (const i of [173, 22, 97]) kernel.attachEntity(ctx, entities[i], rare);
    const live = kernel.getKernelEntities(ctx);
    const expected = live.filter((entity) => kernel.hasEntityTrait(ctx, entity, rare));
    expect(kernel.runQuery(ctx, kernel.selectEntities(ctx, [common, rare]))).toEqual(expected);
    const plan = kernel.prepareQueryPlan(ctx, [common, rare]);
    expect(collect(plan)).toEqual(expected.toSorted((a, b) => a - b));
    kernel.detachEntity(ctx, entities[22], rare);
    kernel.destroyEntity(ctx, entities[173]);
    kernel.attachEntity(ctx, entities[48], rare);
    expect(collect(plan)).toEqual([entities[48], entities[97]].sort((a, b) => a - b));
    const empty = new Uint32Array(0);
    expect(kernel.collectQueryPlanInto(plan, empty)).toBe(2);
    const one = new Uint32Array(1);
    expect(kernel.collectQueryPlanInto(plan, one)).toBe(2);
    expect(one.length).toBe(1);
  });

  it('combines exclusions, alternatives across mask generations, and concrete pairs', () => {
    const excluded = kernel.createTrait();
    const ctx = context([excluded]);
    const tags = Array.from({ length: 65 }, () => kernel.defineTrait(ctx));
    const link = kernel.defineRelation(ctx);
    const target = kernel.createEntity(ctx);
    const pair = kernel.pairEntity(ctx, link, target);
    const entities = Array.from({ length: 5 }, () => kernel.createEntity(ctx));
    for (const entity of entities) kernel.attachEntity(ctx, entity, tags[0]);
    kernel.attachEntity(ctx, entities[0], tags[1]);
    kernel.attachEntity(ctx, entities[1], tags[64]);
    kernel.attachEntity(ctx, entities[2], pair);
    kernel.attachEntity(ctx, entities[3], tags[1]);
    kernel.attachEntity(ctx, entities[3], tags[2]);
    kernel.attachEntity(ctx, entities[4], tags[1]);
    kernel.addTrait(ctx, entities[4], excluded);
    const plan = kernel.prepareQueryPlan(ctx, [tags[0]], {
      any: [tags[1], tags[64], pair],
      none: [tags[2]],
    });
    expect(collect(plan)).toEqual(entities.slice(0, 3).sort((a, b) => a - b));
    expect(collect(kernel.prepareQueryPlan(ctx, [link]))).toEqual([entities[2]]);
    expect(collect(kernel.prepareQueryPlan(ctx, [pair]))).toEqual([entities[2]]);
  });

  it('borrows bounded workspaces safely across nested visits and deferred destruction', () => {
    const ctx = context();
    const tag = kernel.defineTrait(ctx);
    const entities = Array.from({ length: 3 }, () => kernel.createEntity(ctx));
    for (const entity of entities) kernel.attachEntity(ctx, entity, tag);
    const plan = kernel.prepareQueryPlan(ctx, [tag]);
    const small = kernel.createQueryWorkspace(2);
    expect(
      kernel.visitQueryPlan(plan, small, () => {
        throw new Error('Must not visit a truncated selection');
      })
    ).toBe(3);
    const outer = kernel.createQueryWorkspace(3);
    const inner = kernel.createQueryWorkspace(3);
    expect(
      kernel.visitQueryPlan(plan, outer, (borrowed, count) => {
        expect(() => kernel.visitQueryPlan(plan, outer, () => {})).toThrow('already borrowed');
        expect(
          kernel.visitQueryPlan(plan, inner, (_nested, nestedCount) => expect(nestedCount).toBe(3))
        ).toBe(3);
        for (let i = 0; i < count; i++) kernel.destroyEntity(ctx, borrowed[i]);
        expect(kernel.collectQueryPlanInto(plan, [])).toBe(3);
      })
    ).toBe(3);
    expect(kernel.collectQueryPlanInto(plan, [])).toBe(0);
    expect(
      kernel.visitQueryPlan(plan, outer, () => {
        throw new Error('Empty selection');
      })
    ).toBe(0);
  });
});

describe('column publication and bulk creation', () => {
  it.each(['immediate', 'batch'])(
    'preserves negative-query lifecycle order for %s spawning',
    (mode) => {
      const ctx = context();
      const blueprint = kernel.createTrait();
      const tag = kernel.resolveDefinition(ctx, blueprint);
      const terms = [kernel.createModifier('not', 0, [blueprint])];
      const query = kernel.resolveQuery(ctx, terms);
      const events: string[] = [];
      const output = new Uint32Array(1);
      kernel.subscribeQuery(ctx, terms, 'add', (entity) => {
        if (mode === 'batch') expect(output[0]).toBe(entity);
        events.push('enter');
      });
      kernel.subscribeQuery(ctx, terms, 'remove', () => events.push('leave'));
      kernel.subscribeEntityLifecycle(ctx, 'spawn', () => events.push('spawn'));
      const plan = kernel.prepareSpawnPlan(ctx, [tag]);
      kernel.reserveKernel(ctx, 16, 16);
      if (mode === 'batch') expect(kernel.trySpawnBatch(plan, output)).toBe(1);
      else output[0] = kernel.createEntity(ctx, blueprint);
      expect(events).toEqual(['enter', 'leave', 'spawn']);
      expect(kernel.runQuery(ctx, query)).not.toContain(output[0]);
      expect(kernel.hasEntityTrait(ctx, output[0], tag)).toBe(true);
    }
  );

  it('retains change history for a tracking query first compiled after a batch', () => {
    const ctx = context();
    const blueprint = kernel.createTrait({ x: 0 });
    const value = kernel.resolveDefinition(ctx, blueprint);
    const id = kernel.createTrackingId();
    const access = kernel.prepareEntityAccess(ctx, value);
    const plan = kernel.prepareQueryPlan(ctx, [value]);
    kernel.reserveKernel(ctx, 4, 4);
    const entities = new Uint32Array(2);
    kernel.trySpawnBatch(kernel.prepareSpawnPlan(ctx, [value]), entities);
    kernel.visitQueryColumns(
      plan,
      access,
      kernel.createQueryWorkspace(2),
      (_entities, rows, columns, count) => {
        for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 2.5;
      },
      'changed'
    );
    const changed = kernel.resolveQuery(ctx, [kernel.createModifier('changed', id, [blueprint])]);
    expect(kernel.runQuery(ctx, changed).sort((a, b) => a - b)).toEqual(
      Array.from(entities).sort((a, b) => a - b)
    );
    expect(kernel.runQuery(ctx, changed)).toEqual([]);
  });

  it('refreshes borrowed results and pair rows when memberships change', () => {
    const ctx = context();
    const link = kernel.defineRelation(ctx, { store: { weight: 0 } });
    const pair = kernel.pairEntity(ctx, link, kernel.createEntity(ctx));
    const access = kernel.prepareEntityAccess(ctx, pair);
    const plan = kernel.prepareQueryPlan(ctx, [pair]);
    const workspace = kernel.createQueryWorkspace(4);
    kernel.reserveKernel(ctx, 32, 32);
    const first = kernel.tryCreateEntity(ctx);
    const second = kernel.tryCreateEntity(ctx);
    kernel.tryAttachPrepared(access, first);
    const fill = (
      _entities: Readonly<ArrayLike<number>>,
      rows: Readonly<ArrayLike<number>>,
      columns: readonly kernel.ValueColumn[],
      count: number
    ) => {
      for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 9.5;
    };
    expect(kernel.visitQueryColumns(plan, access, workspace, fill, 'changed')).toBe(1);
    kernel.detachPrepared(access, first);
    kernel.tryAttachPrepared(access, second);
    kernel.tryAttachPrepared(access, first);
    expect(kernel.visitQueryColumns(plan, access, workspace, fill, 'changed')).toBe(2);
    for (const entity of [first, second])
      expect(kernel.readEntityTrait(ctx, entity, pair)).toEqual({ weight: 9.5 });
  });

  it('starts publishing to subscribers added after an unobserved batch', () => {
    const ctx = context();
    const blueprint = kernel.createTrait({ x: 0 });
    const value = kernel.resolveDefinition(ctx, blueprint);
    const access = kernel.prepareEntityAccess(ctx, value);
    const plan = kernel.prepareQueryPlan(ctx, [value]);
    kernel.reserveKernel(ctx, 16, 16);
    const entities = new Uint32Array(2);
    kernel.trySpawnBatch(kernel.prepareSpawnPlan(ctx, [value]), entities);
    const workspace = kernel.createQueryWorkspace(2);
    const fill = (
      _entities: Readonly<ArrayLike<number>>,
      rows: Readonly<ArrayLike<number>>,
      columns: readonly kernel.ValueColumn[],
      count: number
    ) => {
      for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 1.5;
    };
    kernel.visitQueryColumns(plan, access, workspace, fill, 'changed');
    let calls = 0;
    const unsubscribe = kernel.subscribeTrait(ctx, blueprint, 'change', () => {
      calls++;
    });
    kernel.visitQueryColumns(plan, access, workspace, fill, 'changed');
    expect(calls).toBe(2);
    unsubscribe();
    kernel.visitQueryColumns(plan, access, workspace, fill, 'changed');
    expect(calls).toBe(2);
  });

  it('publishes completed batches, notices new subscribers, and runs scalar hooks', () => {
    const ctx = context();
    const blueprint = kernel.createTrait(
      { x: 0 },
      {
        onSet(value) {
          value.x += 1;
        },
      }
    );
    const value = kernel.resolveDefinition(ctx, blueprint);
    const access = kernel.prepareEntityAccess(ctx, value);
    const plan = kernel.prepareQueryPlan(ctx, [value]);
    kernel.reserveKernel(ctx, 32, 32);
    const entities = new Uint32Array(3);
    expect(kernel.trySpawnBatch(kernel.prepareSpawnPlan(ctx, [value]), entities)).toBe(3);
    const workspace = kernel.createQueryWorkspace(3);
    const write = (
      _entities: Readonly<ArrayLike<number>>,
      rows: Readonly<ArrayLike<number>>,
      columns: readonly kernel.ValueColumn[],
      count: number
    ) => {
      for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 4.5;
    };
    const version = kernel.getTraitVersionSource(ctx, blueprint)!.version;
    expect(kernel.visitQueryColumns(plan, access, workspace, write, 'silent')).toBe(3);
    expect(kernel.getTraitVersionSource(ctx, blueprint)!.version).toBeGreaterThan(version);
    expect(kernel.readEntityTrait(ctx, entities[0], value)).toEqual({ x: 4.5 });
    const observed: number[][] = [];
    const unsubscribe = kernel.subscribeTrait(ctx, blueprint, 'change', () => {
      observed.push(Array.from(entities, (entity) => kernel.readEntityTrait(ctx, entity, value).x));
    });
    expect(kernel.visitQueryColumns(plan, access, workspace, write, 'changed')).toBe(3);
    expect(observed).toHaveLength(3);
    expect(observed[0].filter((v) => v === 4.5)).toHaveLength(2);
    expect(observed[2]).toEqual([5.5, 5.5, 5.5]);
    unsubscribe();
  });

  it('updates changed queries and preserves queued mutation boundaries after column writes', () => {
    const ctx = context();
    const blueprint = kernel.createTrait({ x: 0 });
    const value = kernel.resolveDefinition(ctx, blueprint);
    const plan = kernel.prepareQueryPlan(ctx, [value]);
    const access = kernel.prepareEntityAccess(ctx, value);
    const id = kernel.createTrackingId();
    const changed = kernel.resolveQuery(ctx, [kernel.createModifier('changed', id, [blueprint])]);
    kernel.reserveKernel(ctx, 32, 32);
    const entities = new Uint32Array(2);
    kernel.trySpawnBatch(kernel.prepareSpawnPlan(ctx, [value]), entities);
    kernel.runQuery(ctx, changed);
    const workspace = kernel.createQueryWorkspace(2);
    kernel.visitQueryColumns(
      plan,
      access,
      workspace,
      (_entities, rows, columns, count) => {
        for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 8.5;
      },
      'changed'
    );
    expect(kernel.runQuery(ctx, changed).sort((a, b) => a - b)).toEqual(
      Array.from(entities).sort((a, b) => a - b)
    );
    expect(kernel.runQuery(ctx, changed)).toEqual([]);
  });

  it('uses membership rows for pair columns and skips callbacks on insufficient capacity', () => {
    const ctx = context();
    const link = kernel.defineRelation(ctx, { store: { weight: 1 } });
    const target = kernel.createEntity(ctx);
    const pair = kernel.pairEntity(ctx, link, target);
    const access = kernel.prepareEntityAccess(ctx, pair);
    const plan = kernel.prepareQueryPlan(ctx, [pair]);
    kernel.reserveKernel(ctx, 64, 64);
    const entities = new Uint32Array(4);
    expect(kernel.trySpawnBatch(kernel.prepareSpawnPlan(ctx, [pair]), entities)).toBe(4);
    expect(
      kernel.visitQueryColumns(
        plan,
        access,
        kernel.createQueryWorkspace(0),
        () => {
          throw new Error('Capacity');
        },
        'changed'
      )
    ).toBe(4);
    kernel.visitQueryColumns(
      plan,
      access,
      kernel.createQueryWorkspace(4),
      (_entities, rows, columns, count) => {
        for (let i = 0; i < count; i++) columns[0][rows[i] >>> 10][rows[i] & 1023] = 2.5;
      },
      'changed'
    );
    for (const entity of entities)
      expect(kernel.readEntityTrait(ctx, entity, pair)).toEqual({ weight: 2.5 });
  });

  it('releases failed borrows and discards deferred commands without rolling back raw writes', () => {
    const ctx = context();
    const value = kernel.defineTrait(ctx, { x: 0 });
    const entity = kernel.createEntity(ctx);
    kernel.attachEntity(ctx, entity, value);
    const plan = kernel.prepareQueryPlan(ctx, [value]);
    const access = kernel.prepareEntityAccess(ctx, value);
    const workspace = kernel.createQueryWorkspace(1);
    expect(() =>
      kernel.visitQueryColumns(
        plan,
        access,
        workspace,
        (entities, rows, columns) => {
          columns[0][rows[0] >>> 10][rows[0] & 1023] = NaN;
          kernel.destroyEntity(ctx, entities[0]);
          throw new Error('Abort batch');
        },
        'changed'
      )
    ).toThrow('Abort batch');
    expect(kernel.hasEntity(ctx, entity)).toBe(true);
    expect(kernel.readEntityTrait(ctx, entity, value).x).toBeNaN();
    expect(kernel.visitQueryPlan(plan, workspace, () => {})).toBe(1);
    expect(kernel.writePreparedValues(access, entity, [3.5])).toBe(true);
  });

  it('creates only the prepared capacity and defers hook-driven edits until the batch completes', () => {
    const ctx = context();
    const events: number[] = [];
    const blueprint = kernel.createTrait(
      { x: 2.5 },
      {
        onAdd(_value, entity) {
          events.push(entity);
          kernel.destroyEntity(ctx, entity);
        },
      }
    );
    const value = kernel.resolveDefinition(ctx, blueprint);
    const plan = kernel.prepareSpawnPlan(ctx, [value, value]);
    const output = new Uint32Array(10);
    expect(kernel.trySpawnBatch(plan, output)).toBe(0);
    kernel.reserveKernel(ctx, 4, 256);
    expect(kernel.trySpawnBatch(plan, output)).toBe(3);
    expect(events).toEqual(Array.from(output.subarray(0, 3)));
    for (const entity of events) expect(kernel.hasEntity(ctx, entity)).toBe(false);
    expect(() => kernel.trySpawnBatch(plan, output, NaN)).toThrow(RangeError);
    expect(() => kernel.createQueryWorkspace(-1)).toThrow(RangeError);
  });

  it('budgets shared relation presence once and rejects conflicting exclusive targets', () => {
    const ctx = context();
    const link = kernel.defineRelation(ctx, { store: { weight: 1 } });
    const targets = [kernel.createEntity(ctx), kernel.createEntity(ctx)];
    const pairs = targets.map((target) => kernel.pairEntity(ctx, link, target));
    const plan = kernel.prepareSpawnPlan(ctx, pairs);
    kernel.reserveKernel(ctx, 200, 256);
    const output = new Uint32Array(100);
    expect(kernel.trySpawnBatch(plan, output)).toBe(85);
    for (const entity of output.subarray(0, 85)) {
      for (const pair of pairs)
        expect(kernel.readEntityTrait(ctx, entity, pair)).toEqual({ weight: 1 });
    }
    const exclusive = kernel.defineRelation(ctx, { exclusive: true });
    const exclusivePairs = targets.map((target) => kernel.pairEntity(ctx, exclusive, target));
    expect(() => kernel.prepareSpawnPlan(ctx, exclusivePairs)).toThrow('multiple exclusive targets');
  });
});
