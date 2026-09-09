import { afterEach, describe, expect, it } from 'vitest';
import { createWorld, relation, trait } from '../src';
import {
  attachEntity,
  visitQuery,
  subscribeEntityLifecycle,
  collectQueryInto,
  reserveKernel,
  tryCreateEntity,
  tryAttachEntity,
  createEntity,
  createKernelContext,
  defineRelation,
  defineTrait,
  destroyEntity,
  destroyKernel,
  detachEntity,
  hasEntity,
  getKernelEntities,
  hasEntityTrait,
  initializeKernel,
  pairEntity,
  readEntityTrait,
  readEntityValues,
  writeEntityValues,
  runQuery,
  selectEntities,
  writeEntityTrait,
} from '../src/kernel';

const contexts: ReturnType<typeof createKernelContext>[] = [];
function context() {
  const ctx = createKernelContext();
  initializeKernel(ctx);
  contexts.push(ctx);
  return ctx;
}
afterEach(() => {
  for (const ctx of contexts) destroyKernel(ctx);
  contexts.length = 0;
});

describe('Entity definitions', () => {
  it('uses definitions as subjects, predicates and relation endpoints', () => {
    const ctx = context();
    const Position = defineTrait(ctx, { x: 0, label: '' });
    const Metadata = defineTrait(ctx, { name: '' });
    const Links = defineRelation(ctx, { store: { weight: 1 } });
    attachEntity(ctx, Position, Metadata, { name: 'position' });
    const pair = pairEntity(ctx, Links, Position);
    attachEntity(ctx, pair, Metadata, { name: 'edge' });
    const entity = createEntity(ctx);
    attachEntity(ctx, entity, Position, { x: 1.5 });
    attachEntity(ctx, entity, pair, { weight: 2.5 });
    expect(readEntityTrait(ctx, Position, Metadata)).toEqual({ name: 'position' });
    expect(readEntityTrait(ctx, pair, Metadata)).toEqual({ name: 'edge' });
    expect(readEntityTrait(ctx, entity, Position)).toEqual({ x: 1.5, label: '' });
    expect(readEntityTrait(ctx, entity, pair)).toEqual({ weight: 2.5 });
    expect(pairEntity(ctx, Links, Position)).toBe(pair);
    expect(runQuery(ctx, selectEntities(ctx, [Metadata]))).toEqual([Position, pair]);
    const query = selectEntities(ctx, [Position, pair]);
    expect(runQuery(ctx, query)).toEqual([entity]);
    detachEntity(ctx, entity, pair);
    expect(runQuery(ctx, query)).toEqual([]);
    attachEntity(ctx, entity, pair);
    expect(readEntityTrait(ctx, entity, pair)).toEqual({ weight: 1 });
  });

  it('cleans users and nested pairs when a definition is destroyed', () => {
    const ctx = context();
    const Tag = defineTrait(ctx);
    const Links = defineRelation(ctx);
    const pair = pairEntity(ctx, Links, Tag);
    const nested = pairEntity(ctx, Links, pair);
    const entity = createEntity(ctx);
    attachEntity(ctx, entity, Tag);
    attachEntity(ctx, entity, pair);
    attachEntity(ctx, entity, nested);
    destroyEntity(ctx, Tag);
    expect(hasEntity(ctx, Tag)).toBe(false);
    expect(hasEntity(ctx, pair)).toBe(false);
    expect(hasEntity(ctx, nested)).toBe(false);
    expect(hasEntity(ctx, entity)).toBe(true);
    expect(hasEntityTrait(ctx, entity, Tag)).toBe(false);
    expect(attachEntity(ctx, entity, Tag)).toBe(false);
  });

  it('allows an ordinary entity to become a tag', () => {
    const ctx = context();
    const tag = createEntity(ctx);
    const subject = createEntity(ctx);
    expect(attachEntity(ctx, subject, tag)).toBe(true);
    expect(hasEntityTrait(ctx, subject, tag)).toBe(true);
    destroyEntity(ctx, tag);
    expect(hasEntityTrait(ctx, subject, tag)).toBe(false);
  });

  it('preserves NaN and fractional values and clears recycled membership data', () => {
    const ctx = context();
    const Value = defineTrait(ctx, { value: 1 });
    const entity = createEntity(ctx);
    attachEntity(ctx, entity, Value, { value: NaN });
    expect(readEntityTrait(ctx, entity, Value).value).toBeNaN();
    writeEntityTrait(ctx, entity, Value, { value: -0.25 });
    expect(readEntityTrait(ctx, entity, Value).value).toBe(-0.25);
    detachEntity(ctx, entity, Value);
    attachEntity(ctx, entity, Value);
    expect(readEntityTrait(ctx, entity, Value).value).toBe(1);
  });

  it('exposes public schema and pair entities without polluting ordinary entity queries', () => {
    const world = createWorld();
    const Position = trait({ x: 0 });
    const Name = trait({ name: '' });
    const Links = relation();
    try {
      const entity = world.spawn(Position);
      expect(Array.from(world.query(Position))).toEqual([entity]);
      const definition = world.entity(Position);
      definition.add(Name({ name: 'Position' }));
      expect(Array.from(world.query(Name))).toEqual([definition]);
      const pair = world.entity(Links(definition));
      pair.add(Name({ name: 'pair' }));
      entity.add(Links(definition));
      expect(entity.has(Links(definition))).toBe(true);
      definition.destroy();
      expect(entity.has(Position)).toBe(false);
      expect(pair.isAlive()).toBe(false);
      entity.add(Position);
      expect(entity.has(Position)).toBe(true);
      expect(world.entity(Position)).not.toBe(definition);
      expect(Array.from(world.query(Position))).toEqual([entity]);
    } finally {
      world.destroy();
    }
  });
});

describe('Identity and storage boundaries', () => {
  it('does not read a recycled subject through a stale handle', () => {
    const world = createWorld();
    const Value = trait({ value: 1 });
    const Link = relation();
    const target = world.spawn();
    const stale = world.spawn(Value, Link(target));
    stale.destroy();
    const replacement = world.spawn(Value({ value: 2 }), Link(target));
    expect(stale.id()).toBe(replacement.id());
    expect(stale.has(Value)).toBe(false);
    expect(stale.get(Value)).toBeUndefined();
    expect(stale.targetsFor(Link)).toEqual([]);
    world.destroy();
  });

  it('retires exhausted slots and keeps all handles inside the positive Smi range', () => {
    const ctx = context();
    const first = createEntity(ctx);
    let entity = first;
    for (let i = 0; i < 600; i++) {
      destroyEntity(ctx, entity);
      entity = createEntity(ctx);
      expect(entity).toBeGreaterThanOrEqual(0);
      expect(entity).toBeLessThan(2 ** 30);
      expect(entity).not.toBe(first);
      expect(hasEntity(ctx, first)).toBe(false);
    }
  });

  it('does not retarget a numeric query when a destroyed pair is reinterned', () => {
    const ctx = context();
    const link = defineRelation(ctx);
    const target = createEntity(ctx);
    const oldPair = pairEntity(ctx, link, target);
    const entity = createEntity(ctx);
    attachEntity(ctx, entity, oldPair);
    const oldQuery = selectEntities(ctx, [oldPair]);
    destroyEntity(ctx, oldPair);
    const freshPair = pairEntity(ctx, link, target);
    attachEntity(ctx, entity, freshPair);
    expect(runQuery(ctx, oldQuery)).toEqual([]);
    expect(runQuery(ctx, selectEntities(ctx, [freshPair]))).toEqual([entity]);
  });

  it('compiles arbitrary own schema keys safely', () => {
    const ctx = context();
    const value = defineTrait(ctx, { ['__proto__']: 1, 'x-y': 2, "a'b": 3 });
    const entity = createEntity(ctx);
    attachEntity(ctx, entity, value);
    expect(readEntityTrait(ctx, entity, value)).toEqual({ ['__proto__']: 1, 'x-y': 2, "a'b": 3 });
  });
});

describe('Prepared capacity', () => {
  it('prepares the requested capacity when an aged recycled slot retires during preparation', () => {
    const ctx = context();
    const alive = getKernelEntities(ctx, true).length;
    let aged = false;
    for (let i = 0; i < 512; i++) {
      const entity = createEntity(ctx);
      destroyEntity(ctx, entity);
      if (entity >>> 22 === 254) {
        aged = true;
        break;
      }
    }
    expect(aged).toBe(true);
    reserveKernel(ctx, alive + 2, 256);
    expect(tryCreateEntity(ctx)).toBeGreaterThanOrEqual(0);
    expect(tryCreateEntity(ctx)).toBeGreaterThanOrEqual(0);
    expect(tryCreateEntity(ctx)).toBe(-1);
  });

  it('reports full capacity without growing and reuses released slots', () => {
    const ctx = context();
    const tag = defineTrait(ctx);
    reserveKernel(ctx, 3, 256);
    const first = tryCreateEntity(ctx);
    const second = tryCreateEntity(ctx);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThanOrEqual(0);
    expect(tryCreateEntity(ctx)).toBe(-1);
    expect(tryAttachEntity(ctx, first, tag)).toBe(1);
    expect(tryAttachEntity(ctx, first, tag)).toBe(0);
    const query = selectEntities(ctx, [tag]);
    const output = new Uint32Array(0);
    expect(collectQueryInto(ctx, query, output)).toBe(1);
    destroyEntity(ctx, first);
    const replacement = tryCreateEntity(ctx);
    expect(replacement).toBeGreaterThanOrEqual(0);
    expect(replacement).not.toBe(first);
    expect(collectQueryInto(ctx, query, output)).toBe(0);
  });

  it('keeps cached intersections correct through repeated membership churn', () => {
    const ctx = context();
    const tags = Array.from({ length: 8 }, () => defineTrait(ctx));
    const entities = Array.from({ length: 64 }, () => createEntity(ctx));
    const expected = entities.map(() => new Set<number>());
    const query = selectEntities(ctx, [tags[0], tags[1]]);
    let seed = 17;
    for (let i = 0; i < 4096; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const subject = (seed >>> 8) & 63;
      const tag = (seed >>> 20) & 7;
      if (expected[subject].has(tag)) {
        detachEntity(ctx, entities[subject], tags[tag]);
        expected[subject].delete(tag);
      } else {
        attachEntity(ctx, entities[subject], tags[tag]);
        expected[subject].add(tag);
      }
      if ((i & 255) === 0) {
        expect(runQuery(ctx, query).sort((a, b) => a - b)).toEqual(
          entities
            .filter((_, index) => expected[index].has(0) && expected[index].has(1))
            .sort((a, b) => a - b)
        );
      }
    }
  });
});

it('reports membership exhaustion before publishing a partial attachment', () => {
  const ctx = context();
  const tag = defineTrait(ctx);
  reserveKernel(ctx, 258, 256);
  for (let i = 0; i < 256; i++) expect(tryAttachEntity(ctx, tryCreateEntity(ctx), tag)).toBe(1);
  const entity = tryCreateEntity(ctx);
  expect(tryAttachEntity(ctx, entity, tag)).toBe(-1);
  expect(hasEntityTrait(ctx, entity, tag)).toBe(false);
});

it('copies numeric rows through caller buffers and rejects partial writes', () => {
  const ctx = context();
  const value = defineTrait(ctx, { x: 1, y: 2 });
  const entity = createEntity(ctx);
  attachEntity(ctx, entity, value);
  const short = new Float64Array(1);
  expect(readEntityValues(ctx, entity, value, short)).toBe(2);
  expect(short[0]).toBe(1);
  short[0] = 7;
  expect(writeEntityValues(ctx, entity, value, short)).toBe(false);
  const row = new Float64Array([NaN, -0.25]);
  expect(writeEntityValues(ctx, entity, value, row)).toBe(true);
  row.fill(0);
  expect(readEntityValues(ctx, entity, value, row)).toBe(2);
  expect(row[0]).toBeNaN();
  expect(row[1]).toBe(-0.25);
  detachEntity(ctx, entity, value);
  expect(readEntityValues(ctx, entity, value, row)).toBe(-1);
});

it('borrows stable query entities across nested visits and deferred destruction', () => {
  const ctx = context();
  const value = defineTrait(ctx, { x: 0 });
  const entities = Array.from({ length: 32 }, () => createEntity(ctx));
  for (const entity of entities) attachEntity(ctx, entity, value);
  const query = selectEntities(ctx, [value]);
  const row = new Float64Array([2.5]);
  let visited = 0;
  visitQuery(ctx, query, (borrowed, count) => {
    visitQuery(ctx, query, (nested, nestedCount) => {
      expect(nestedCount).toBe(count);
      expect(nested[0]).toBe(borrowed[0]);
    });
    for (let i = 0; i < count; i++) {
      expect(writeEntityValues(ctx, borrowed[i], value, row)).toBe(true);
      destroyEntity(ctx, borrowed[i]);
      expect(hasEntity(ctx, borrowed[i])).toBe(true);
      visited++;
    }
  });
  expect(visited).toBe(entities.length);
  expect(runQuery(ctx, query)).toEqual([]);
  visitQuery(ctx, query, () => {
    throw new Error('Empty queries do not call visitors');
  });
});

it('aborts queued visitor edits on exceptions and restores immediate mutation', () => {
  const ctx = context();
  const tag = defineTrait(ctx);
  const entity = createEntity(ctx);
  attachEntity(ctx, entity, tag);
  const query = selectEntities(ctx, [tag]);
  expect(() =>
    visitQuery(ctx, query, () => {
      destroyEntity(ctx, entity);
      throw new Error('visitor failed');
    })
  ).toThrow('visitor failed');
  expect(hasEntity(ctx, entity)).toBe(true);
  detachEntity(ctx, entity, tag);
  expect(runQuery(ctx, query)).toEqual([]);
});

it('publishes definition lifecycle events once when exposed', () => {
  const ctx = context();
  const spawned: number[] = [];
  const destroyed: number[] = [];
  subscribeEntityLifecycle(ctx, 'spawn', (entity) => spawned.push(entity));
  subscribeEntityLifecycle(ctx, 'destroy', (entity) => destroyed.push(entity));
  const tag = defineTrait(ctx);
  const link = defineRelation(ctx);
  const pair = pairEntity(ctx, link, tag);
  expect(pairEntity(ctx, link, tag)).toBe(pair);
  expect(spawned).toEqual([tag, link, pair]);
  destroyEntity(ctx, tag);
  expect(new Set(destroyed)).toEqual(new Set([tag, pair]));
});

it('uses bare relation predicates for presence and removal while data belongs to concrete pairs', () => {
  const ctx = context();
  const link = defineRelation(ctx, { store: { weight: 1 } });
  const entity = createEntity(ctx);
  const target = createEntity(ctx);
  const pair = pairEntity(ctx, link, target);
  const values = new Float64Array([99]);
  expect(attachEntity(ctx, entity, link)).toBe(false);
  expect(tryAttachEntity(ctx, entity, link)).toBe(-2);
  attachEntity(ctx, entity, pair, { weight: 2.5 });
  expect(hasEntityTrait(ctx, entity, link)).toBe(true);
  expect(runQuery(ctx, selectEntities(ctx, [link]))).toEqual([entity]);
  expect(readEntityTrait(ctx, entity, link)).toBeUndefined();
  expect(readEntityValues(ctx, entity, link, values)).toBe(-1);
  expect(writeEntityValues(ctx, entity, link, values)).toBe(false);
  expect(writeEntityTrait(ctx, entity, link, { weight: 99 })).toBe(false);
  expect(readEntityTrait(ctx, entity, pair)).toEqual({ weight: 2.5 });
  expect(detachEntity(ctx, entity, link)).toBe(true);
  expect(hasEntityTrait(ctx, entity, pair)).toBe(false);
});

it('does not revive destroyed numeric predicates during deferred playback', () => {
  const ctx = context();
  const tag = defineTrait(ctx);
  const link = defineRelation(ctx);
  const target = createEntity(ctx);
  const pair = pairEntity(ctx, link, target);
  const subject = createEntity(ctx);
  const query = selectEntities(ctx, []);
  visitQuery(ctx, query, () => {
    destroyEntity(ctx, tag);
    attachEntity(ctx, subject, tag);
    destroyEntity(ctx, pair);
    attachEntity(ctx, subject, pair);
  });
  expect(hasEntity(ctx, tag)).toBe(false);
  expect(hasEntity(ctx, pair)).toBe(false);
  expect(hasEntityTrait(ctx, subject, tag)).toBe(false);
  expect(hasEntityTrait(ctx, subject, link)).toBe(false);
  expect(runQuery(ctx, query).sort((a, b) => a - b)).toEqual(
    [link, target, subject].sort((a, b) => a - b)
  );
});

it('applies queued numeric attachments, writes and removals in order', () => {
  const ctx = context();
  const value = defineTrait(ctx, { x: 1 });
  const subject = createEntity(ctx);
  const query = selectEntities(ctx, []);
  visitQuery(ctx, query, () => attachEntity(ctx, subject, value, { x: 2.5 }));
  expect(readEntityTrait(ctx, subject, value)).toEqual({ x: 2.5 });
  visitQuery(ctx, query, () => writeEntityTrait(ctx, subject, value, { x: 3.5 }));
  expect(readEntityTrait(ctx, subject, value)).toEqual({ x: 3.5 });
  visitQuery(ctx, query, () => detachEntity(ctx, subject, value));
  expect(hasEntityTrait(ctx, subject, value)).toBe(false);
});

it('queues numeric edits to a reserved spawn and evaluates their membership in playback order', () => {
  const ctx = context();
  const value = defineTrait(ctx, { x: 0 });
  const query = selectEntities(ctx, []);
  let subject = -1;
  visitQuery(ctx, query, () => {
    subject = createEntity(ctx);
    expect(attachEntity(ctx, subject, value, { x: 1.5 })).toBe(true);
    expect(writeEntityTrait(ctx, subject, value, { x: 2.5 })).toBe(true);
    expect(detachEntity(ctx, subject, value)).toBe(true);
    expect(attachEntity(ctx, subject, value, { x: 3.5 })).toBe(true);
    expect(hasEntity(ctx, subject)).toBe(false);
  });
  expect(hasEntity(ctx, subject)).toBe(true);
  expect(readEntityTrait(ctx, subject, value)).toEqual({ x: 3.5 });
});

it('keeps entity lookup local across page boundaries and recycled subjects', () => {
  const leading = context();
  for (let i = 0; i < 4096; i++) createEntity(leading);
  const ctx = context();
  const value = defineTrait(ctx, { x: 1 });
  const entities = Array.from({ length: 2049 }, () => createEntity(ctx));
  for (const entity of entities) attachEntity(ctx, entity, value);
  for (let i = 0; i < entities.length; i += 2) destroyEntity(ctx, entities[i]);
  for (let i = 0; i < entities.length; i++) {
    expect(hasEntity(leading, entities[i])).toBe(false);
    expect(hasEntity(ctx, entities[i])).toBe((i & 1) === 1);
  }
  for (let i = 0; i < 1025; i++) attachEntity(ctx, createEntity(ctx), value, { x: 2.5 });
  expect(runQuery(ctx, selectEntities(ctx, [value]))).toHaveLength(2049);
});

it('requires definition and pair creation outside lifecycle mutations', () => {
  const ctx = context();
  const link = defineRelation(ctx);
  const target = createEntity(ctx);
  subscribeEntityLifecycle(ctx, 'destroy', (entity) => {
    if (entity !== target) return;
    expect(() => pairEntity(ctx, link, target)).toThrow('outside mutations');
    expect(() => defineTrait(ctx)).toThrow('outside mutations');
    expect(() => attachEntity(ctx, link, target)).toThrow('outside mutations');
  });
  destroyEntity(ctx, target);
  expect(getKernelEntities(ctx, true)).toEqual([link]);
});
