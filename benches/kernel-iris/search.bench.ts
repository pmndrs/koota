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
  group('cold search 20 queries 100 matches among 10k @kernel-iris @kernel-iris-search', () => {
    bench('Koota compile and count', function* () {
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
            matches += kernel.collectQueryInto(
              f.ctx,
              kernel.selectEntities(f.ctx, selection),
              output
            );
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
    bench('Iris compile and count', function* () {
      const prepare = () => {
        const f = createIrisFixture(definitions, 10_000, 1, 6);
        for (let i = 100; i < f.entities.length; i++)
          api.removeComponent(f.world, f.entities[i], f.tags[0]);
        return f;
      };
      let f = prepare();
      let terms = queryTerms(f.values[0], f.tags);
      let matches = 0;
      const count = () => {
        matches++;
      };
      yield {
        manual: () => {
          matches = 0;
          const start = performance.now();
          for (const selection of terms) api.EXPERIMENTAL_queryEntities(f.world, selection, count);
          return (performance.now() - start) * 1e6;
        },
        after: () => {
          assert.equal(matches, 2_000);
          api.resetWorld(f.world);
          f = prepare();
          terms = queryTerms(f.values[0], f.tags);
        },
      };
      api.resetWorld(f.world);
      return matches;
    });
  });
}
