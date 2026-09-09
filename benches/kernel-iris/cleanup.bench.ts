import { assert, bench, group } from '@pmndrs/labs';
import * as kernel from '../../packages/core/src/kernel';
import { createKootaFixture, queryTerms } from './fixtures';

// Interleave frozen and current kernels so both sample the same machine conditions.
if (process.env.KOOTA_BEFORE_SOURCE) {
  const before: typeof kernel = await import(process.env.KOOTA_BEFORE_SOURCE);
  group('kernel cleanup 10k @kernel-cleanup', () => {
    for (const [variant, api] of [
      ['before', before],
      ['after', kernel],
    ] as const) {
      for (const prepared of [false, true]) {
        bench(`${prepared ? 'prepared' : 'numeric'} values ${variant}`, function* () {
          const f = createKootaFixture(10_000, 1, 1, false, api);
          const access = api.prepareEntityAccess(f.ctx, f.values[0]);
          const result = yield prepared
            ? () => {
                let sum = 0;
                for (let i = 0; i < f.entities.length; i++) {
                  f.buffer[0] = i + 0.5;
                  api.writePreparedValues(access, f.entities[i], f.buffer);
                  api.readPreparedValues(access, f.entities[i], f.buffer);
                  sum += f.buffer[0];
                }
                return sum;
              }
            : () => {
                let sum = 0;
                for (let i = 0; i < f.entities.length; i++) {
                  f.buffer[0] = i + 0.5;
                  api.writeEntityValues(f.ctx, f.entities[i], f.values[0], f.buffer);
                  api.readEntityValues(f.ctx, f.entities[i], f.values[0], f.buffer);
                  sum += f.buffer[0];
                }
                return sum;
              };
          assert.equal(result, 50_000_000);
          api.destroyKernel(f.ctx);
          return result;
        });
      }
      for (const cached of [false, true]) {
        bench(`prepared tag toggle ${cached ? '20 queries' : 'no queries'} ${variant}`, function* () {
          const f = createKootaFixture(10_000, 1, cached ? 6 : 1, false, api);
          const access = api.prepareEntityAccess(f.ctx, f.tags[0]);
          if (cached)
            for (const terms of queryTerms(f.values[0], f.tags)) api.selectEntities(f.ctx, terms);
          api.reserveKernel(f.ctx, 10_032, cached ? 70_000 : 20_000);
          const result = yield () => {
            let count = 0;
            for (let i = 0; i < f.entities.length; i++) {
              api.detachPrepared(access, f.entities[i]);
              count += api.tryAttachPrepared(access, f.entities[i]);
            }
            return count;
          };
          assert.equal(result, 10_000);
          api.destroyKernel(f.ctx);
          return result;
        });
      }
    }
  });
}
