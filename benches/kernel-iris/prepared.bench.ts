import { assert, bench, group } from '@pmndrs/labs';
import type * as Kernel from '../../packages/core/src/kernel';
const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);
import {
  createIrisDefinitions,
  createIrisFixture,
  createKootaFixture,
  iris,
  queryTerms,
} from './fixtures';

group('prepared entity operations 10k @kernel-prepared', () => {
  bench('prepared has present', function* () {
    const f = createKootaFixture();
    const access = kernel.prepareEntityAccess(f.ctx, f.values[0]);
    const result = yield () => {
      let count = 0;
      for (let i = 0; i < f.entities.length; i++)
        if (kernel.hasPreparedTrait(access, f.entities[i])) count++;
      return count;
    };
    assert.equal(result, 10_000);
    kernel.destroyKernel(f.ctx);
    return result;
  });
  bench('prepared scalar write and read', function* () {
    const f = createKootaFixture();
    const access = kernel.prepareEntityAccess(f.ctx, f.values[0]);
    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < f.entities.length; i++) {
        f.buffer[0] = i + 0.5;
        kernel.writePreparedValues(access, f.entities[i], f.buffer);
        kernel.readPreparedValues(access, f.entities[i], f.buffer);
        sum += f.buffer[0];
      }
      return sum;
    };
    assert.equal(result, 50_000_000);
    kernel.destroyKernel(f.ctx);
    return result;
  });
  for (const mode of ['none', 'cached', 'streaming'] as const) {
    for (const readAfter of mode === 'none' ? [false] : [false, true]) {
      bench(
        `prepared tag toggle ${mode} queries${readAfter ? ' and materialize 20 results' : ''}`,
        function* () {
          const f = createKootaFixture(10_000, 1, mode === 'none' ? 1 : 6);
          const access = kernel.prepareEntityAccess(f.ctx, f.tags[0]);
          const terms = mode === 'none' ? [] : queryTerms(f.values[0], f.tags);
          const cached =
            mode === 'cached'
              ? terms.map((selection) => kernel.selectEntities(f.ctx, selection))
              : [];
          const plans =
            mode === 'streaming'
              ? terms.map((selection) => kernel.prepareQueryPlan(f.ctx, selection))
              : [];
          const output = new Uint32Array(10_000);
          kernel.reserveKernel(f.ctx, 10_032, 70_000);
          const result = yield () => {
            let count = 0;
            for (let i = 0; i < f.entities.length; i++) {
              kernel.detachPrepared(access, f.entities[i]);
              count += kernel.tryAttachPrepared(access, f.entities[i]);
            }
            if (readAfter) {
              for (let i = 0; i < cached.length; i++)
                count += kernel.collectQueryInto(f.ctx, cached[i], output);
              for (let i = 0; i < plans.length; i++)
                count += kernel.collectQueryPlanInto(plans[i], output);
            }
            return count;
          };
          assert.equal(result, readAfter ? 210_000 : 10_000);
          for (const plan of plans) assert.equal(kernel.collectQueryPlanInto(plan, output), 10_000);
          for (const query of cached)
            assert.equal(kernel.collectQueryInto(f.ctx, query, output), 10_000);
          kernel.destroyKernel(f.ctx);
          return result;
        }
      );
    }
  }
  bench('prepared shared pair toggle', function* () {
    const f = createKootaFixture(10_000, 1, 1, true);
    const access = kernel.prepareEntityAccess(f.ctx, f.pair);
    const result = yield () => {
      let count = 0;
      for (let i = 0; i < f.entities.length; i++) {
        kernel.detachPrepared(access, f.entities[i]);
        count += kernel.tryAttachPrepared(access, f.entities[i]);
      }
      return count;
    };
    assert.equal(result, 10_000);
    kernel.destroyKernel(f.ctx);
    return result;
  });
});

group('prepared columns 10k @kernel-prepared @kernel-prepared-columns', () => {
  for (const policy of ['silent', 'changed', 'observed'] as const) {
    bench(`paged columns ${policy}`, function* () {
      const f = createKootaFixture();
      const access = kernel.prepareEntityAccess(f.ctx, f.values[0]);
      const plan = kernel.prepareQueryPlan(f.ctx, [f.values[0], f.tags[0]]);
      const workspace = kernel.createQueryWorkspace(10_000);
      let events = 0;
      const unsubscribe =
        policy === 'observed'
          ? kernel.subscribeTrait(f.ctx, f.blueprints[0], 'change', () => {
              events++;
            })
          : null;
      let sum = 0;
      const write = (
        _entities: Readonly<ArrayLike<number>>,
        rows: Readonly<ArrayLike<number>>,
        columns: readonly Kernel.ValueColumn[],
        count: number
      ) => {
        const values = columns[0];
        let total = 0;
        for (let i = 0; i < count; i++) {
          const row = rows[i];
          const page = values[row >>> 10];
          page[row & 1023] = i + 0.5;
          total += page[row & 1023];
        }
        sum = total;
      };
      const publication = policy === 'silent' ? 'silent' : 'changed';
      kernel.visitQueryColumns(plan, access, workspace, write, publication);
      const result = yield () => {
        events = 0;
        kernel.visitQueryColumns(plan, access, workspace, write, publication);
        return sum + events;
      };
      assert.equal(result, 50_000_000 + (policy === 'observed' ? 10_000 : 0));
      if (unsubscribe) unsubscribe();
      kernel.destroyKernel(f.ctx);
      return result;
    });
  }
});

group('prepared query discovery @kernel-prepared', () => {
  bench('compile and count 20 plans 100 matches among 10k', function* () {
    const prepare = () => {
      const f = createKootaFixture(10_000, 1, 6);
      for (let i = 100; i < f.entities.length; i++)
        kernel.detachEntity(f.ctx, f.entities[i], f.tags[0]);
      return f;
    };
    let f = prepare();
    let terms = queryTerms(f.values[0], f.tags);
    const output = new Uint32Array(0);
    let matches = 0;
    yield {
      manual: () => {
        matches = 0;
        const start = performance.now();
        for (const selection of terms)
          matches += kernel.collectQueryPlanInto(kernel.prepareQueryPlan(f.ctx, selection), output);
        return (performance.now() - start) * 1e6;
      },
      after: () => {
        assert.equal(matches, 2_000);
        kernel.destroyKernel(f.ctx);
        f = prepare();
        terms = queryTerms(f.values[0], f.tags);
      },
    };
    kernel.destroyKernel(f.ctx);
    return matches;
  });
});

group('prepared bulk creation @kernel-prepared @kernel-prepared-population', () => {
  bench('cold prepare and populate 10k three scalars', function* () {
    let f: ReturnType<typeof createKootaFixture> | null = null;
    let created = 0;
    yield {
      manual: () => {
        const start = performance.now();
        f = createKootaFixture(0, 3, 0);
        const spawn = kernel.prepareSpawnPlan(f.ctx, f.values);
        kernel.reserveKernel(f.ctx, 10_032, 30_000);
        created = kernel.trySpawnBatch(spawn, new Uint32Array(10_000));
        return (performance.now() - start) * 1e6;
      },
      after: () => {
        assert.equal(created, 10_000);
        assert.equal(
          kernel.collectQueryPlanInto(kernel.prepareQueryPlan(f!.ctx, f!.values), []),
          10_000
        );
        kernel.destroyKernel(f!.ctx);
        f = null;
      },
    };
    return created;
  });

  bench('warm prepared spawn 10k three scalars', function* () {
    const f = createKootaFixture(0, 3, 0);
    const plan = kernel.prepareSpawnPlan(f.ctx, f.values);
    kernel.reserveKernel(f.ctx, 10_032, 30_000);
    const output = new Uint32Array(10_000);
    let created = 0;
    yield {
      manual: () => {
        const start = performance.now();
        created = kernel.trySpawnBatch(plan, output);
        return (performance.now() - start) * 1e6;
      },
      after: () => {
        assert.equal(created, 10_000);
        for (const value of f.values)
          assert.equal(kernel.readEntityTrait(f.ctx, output[9_999], value).value, 0);
        for (let i = 0; i < created; i++) kernel.destroyEntity(f.ctx, output[i]);
        kernel.reserveKernel(f.ctx, 10_032, 30_000);
      },
    };
    kernel.destroyKernel(f.ctx);
    return created;
  });

  if (iris) {
    const api = iris;
    const definitions = createIrisDefinitions();
    bench('Iris spawn 10k three scalars into empty world', function* () {
      let f = createIrisFixture(definitions, 0, 3, 0);
      const output = new Uint32Array(10_000);
      let created = 0;
      yield {
        manual: () => {
          const start = performance.now();
          for (created = 0; created < output.length; created++)
            output[created] = api.createEntity(f.world, f.values);
          return (performance.now() - start) * 1e6;
        },
        after: () => {
          assert.equal(created, 10_000);
          for (const value of f.values)
            assert.equal(api.getComponentValue(f.world, output[9_999], value, 'value'), 0);
          api.resetWorld(f.world);
          f = createIrisFixture(definitions, 0, 3, 0);
        },
      };
      api.resetWorld(f.world);
      return created;
    });
  }
});
