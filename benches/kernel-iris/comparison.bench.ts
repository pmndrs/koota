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

if (iris) {
  const api = iris;
  const definitions = createIrisDefinitions();

  group('matched valid-entity operations 10k @kernel-iris', () => {
    bench('Koota has present', function* () {
      const f = createKootaFixture();
      const result = yield () => {
        let count = 0;
        for (let i = 0; i < f.entities.length; i++)
          if (kernel.hasEntityTrait(f.ctx, f.entities[i], f.values[0])) count++;
        return count;
      };
      assert.equal(result, 10_000);
      kernel.destroyKernel(f.ctx);
      return result;
    });
    bench('Iris has present', function* () {
      const f = createIrisFixture(definitions);
      const result = yield () => {
        let count = 0;
        for (let i = 0; i < f.entities.length; i++)
          if (api.hasComponent(f.world, f.entities[i], f.values[0])) count++;
        return count;
      };
      assert.equal(result, 10_000);
      api.resetWorld(f.world);
      return result;
    });
    bench('Koota scalar write and read', function* () {
      const f = createKootaFixture();
      const result = yield () => {
        let sum = 0;
        for (let i = 0; i < f.entities.length; i++) {
          f.buffer[0] = i + 0.5;
          kernel.writeEntityValues(f.ctx, f.entities[i], f.values[0], f.buffer);
          kernel.readEntityValues(f.ctx, f.entities[i], f.values[0], f.buffer);
          sum += f.buffer[0];
        }
        return sum;
      };
      assert.equal(result, 50_000_000);
      kernel.destroyKernel(f.ctx);
      return result;
    });
    bench('Iris scalar write and read', function* () {
      const f = createIrisFixture(definitions);
      const result = yield () => {
        let sum = 0;
        for (let i = 0; i < f.entities.length; i++) {
          api.setComponentValue(f.world, f.entities[i], f.values[0], 'value', i + 0.5);
          sum += api.getComponentValue(f.world, f.entities[i], f.values[0], 'value');
        }
        return sum;
      };
      assert.equal(result, 50_000_000);
      api.resetWorld(f.world);
      return result;
    });
    for (const queries of [false, true]) {
      const label = queries ? 'with 20 queries' : 'without queries';
      bench(`Koota tag toggle ${label}`, function* () {
        const f = createKootaFixture(10_000, 1, queries ? 6 : 1);
        const selections = queries
          ? queryTerms(f.values[0], f.tags).map((terms) => kernel.selectEntities(f.ctx, terms))
          : [];
        kernel.reserveKernel(f.ctx, 10_032, 10_000 * (queries ? 7 : 2));
        const result = yield () => {
          let count = 0;
          for (let i = 0; i < f.entities.length; i++) {
            kernel.detachEntity(f.ctx, f.entities[i], f.tags[0]);
            count += kernel.tryAttachEntity(f.ctx, f.entities[i], f.tags[0]);
          }
          return count;
        };
        assert.equal(result, 10_000);
        for (const query of selections)
          assert.equal(kernel.collectQueryInto(f.ctx, query, new Uint32Array(0)), 10_000);
        kernel.destroyKernel(f.ctx);
        return result;
      });
      bench(`Iris tag toggle ${label}`, function* () {
        const f = createIrisFixture(definitions, 10_000, 1, queries ? 6 : 1);
        const selections = queries ? queryTerms(f.values[0], f.tags) : [];
        for (const terms of selections) api.EXPERIMENTAL_queryEntities(f.world, terms, () => {});
        const result = yield () => {
          for (let i = 0; i < f.entities.length; i++) {
            api.removeComponent(f.world, f.entities[i], f.tags[0]);
            api.addComponent(f.world, f.entities[i], f.tags[0]);
          }
          return f.entities.length;
        };
        assert.equal(result, 10_000);
        for (const entity of f.entities)
          assert.equal(api.hasComponent(f.world, entity, f.tags[0]), true);
        for (const terms of selections) {
          let count = 0;
          api.EXPERIMENTAL_queryEntities(f.world, terms, () => {
            count++;
          });
          assert.equal(count, 10_000);
        }
        api.resetWorld(f.world);
        return result;
      });
    }
    bench('Koota shared pair toggle', function* () {
      const f = createKootaFixture(10_000, 1, 1, true);
      const result = yield () => {
        let count = 0;
        for (let i = 0; i < f.entities.length; i++) {
          kernel.detachEntity(f.ctx, f.entities[i], f.pair);
          count += kernel.tryAttachEntity(f.ctx, f.entities[i], f.pair);
        }
        return count;
      };
      assert.equal(result, 10_000);
      kernel.destroyKernel(f.ctx);
      return result;
    });
    bench('Iris shared pair toggle', function* () {
      const f = createIrisFixture(definitions, 10_000, 1, 1, true);
      const result = yield () => {
        for (let i = 0; i < f.entities.length; i++) {
          api.removeComponent(f.world, f.entities[i], f.pair);
          api.addComponent(f.world, f.entities[i], f.pair);
        }
        return f.entities.length;
      };
      assert.equal(result, 10_000);
      for (const entity of f.entities) assert.equal(api.hasComponent(f.world, entity, f.pair), true);
      api.resetWorld(f.world);
      return result;
    });
  });

  group('cold population 10k three scalar traits @kernel-iris', () => {
    bench('Koota prepare and populate', function* () {
      let f: ReturnType<typeof createKootaFixture> | null = null;
      yield {
        manual: () => {
          const start = performance.now();
          f = createKootaFixture(10_000, 3, 0);
          return (performance.now() - start) * 1e6;
        },
        after: () => {
          assert.equal(kernel.hasEntityTrait(f!.ctx, f!.entities[9_999], f!.values[2]), true);
          kernel.destroyKernel(f!.ctx);
          f = null;
        },
      };
      return 10_000;
    });
    bench('Iris create and populate', function* () {
      let f: ReturnType<typeof createIrisFixture> | null = null;
      yield {
        manual: () => {
          const start = performance.now();
          f = createIrisFixture(definitions, 10_000, 3, 0);
          return (performance.now() - start) * 1e6;
        },
        after: () => {
          assert.equal(api.hasComponent(f!.world, f!.entities[9_999], f!.values[2]), true);
          api.resetWorld(f!.world);
          f = null;
        },
      };
      return 10_000;
    });
  });

  group('query output 10k @kernel-iris', () => {
    bench('Koota collect into prepared output', function* () {
      const f = createKootaFixture();
      const query = kernel.selectEntities(f.ctx, [f.values[0], f.tags[0]]);
      const output = new Uint32Array(10_000);
      const result = yield () => kernel.collectQueryInto(f.ctx, query, output);
      assert.equal(result, 10_000);
      for (const entity of output)
        assert.equal(kernel.hasEntityTrait(f.ctx, entity, f.values[0]), true);
      kernel.destroyKernel(f.ctx);
      return result;
    });
    bench('Iris collect into prepared output through callback', function* () {
      const f = createIrisFixture(definitions);
      const terms = [f.values[0], f.tags[0]];
      const output = new Uint32Array(10_000);
      let count = 0;
      const collect = (entity: number) => {
        output[count++] = entity;
      };
      api.EXPERIMENTAL_queryEntities(f.world, terms, collect);
      const result = yield () => {
        count = 0;
        api.EXPERIMENTAL_queryEntities(f.world, terms, collect);
        return count;
      };
      assert.equal(result, 10_000);
      for (const entity of output) assert.equal(api.hasComponent(f.world, entity, f.values[0]), true);
      api.resetWorld(f.world);
      return result;
    });
  });

  group('borrowed scalar columns 10k @kernel-iris @kernel-iris-columns', () => {
    for (const publish of [false, true]) {
      const label = publish ? 'with explicit change publication' : 'without change publication';
      bench(`Koota paged columns ${label}`, function* () {
        const f = createKootaFixture();
        const pages = kernel.getStore(f.ctx, f.blueprints[0]).value;
        const query = kernel.selectEntities(f.ctx, [f.values[0], f.tags[0]]);
        let sum = 0;
        const write = (entities: Readonly<ArrayLike<number>>, count: number) => {
          let total = 0;
          for (let i = 0; i < count; i++) {
            const id = kernel.getEntityId(entities[i]);
            const page = pages[id >>> 10];
            page[id & 1023] = i + 0.5;
            total += page[id & 1023];
          }
          sum += total;
        };
        const result = yield () => {
          sum = 0;
          kernel.visitQuery(f.ctx, query, write);
          if (publish)
            for (let i = 0; i < f.entities.length; i++)
              kernel.setChanged(f.ctx, f.entities[i], f.blueprints[0]);
          return sum;
        };
        assert.equal(result, 50_000_000);
        for (let i = 0; i < f.entities.length; i++) {
          kernel.readEntityValues(f.ctx, f.entities[i], f.values[0], f.buffer);
          assert.equal(f.buffer[0], i + 0.5);
        }
        kernel.destroyKernel(f.ctx);
        return result;
      });
      bench(`Iris dense columns ${label}`, function* () {
        const f = createIrisFixture(definitions);
        const terms = [f.values[0], f.tags[0]];
        let sum = 0;
        const write = (entities: number[], columns: { value: Float64Array }[]) => {
          const values = columns[0].value;
          let total = 0;
          for (let i = 0; i < entities.length; i++) {
            values[i] = i + 0.5;
            total += values[i];
          }
          sum += total;
        };
        api.EXPERIMENTAL_queryColumns(f.world, terms, write);
        const result = yield () => {
          sum = 0;
          api.EXPERIMENTAL_queryColumns(f.world, terms, write);
          if (publish)
            for (let i = 0; i < f.entities.length; i++)
              api.markComponentChanged(f.world, f.entities[i], f.values[0]);
          return sum;
        };
        assert.equal(result, 50_000_000);
        for (let i = 0; i < f.entities.length; i++)
          assert.equal(api.getComponentValue(f.world, f.entities[i], f.values[0], 'value'), i + 0.5);
        api.resetWorld(f.world);
        return result;
      });
    }
  });
}
