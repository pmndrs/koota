import { assert, bench, group } from '@pmndrs/labs';
import type * as Kernel from '../../packages/core/src/kernel';

const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);

group('global paged entity addressing @kernel-addressing', () => {
  for (const leadingCount of [0, 65_536, 1_048_576]) {
    bench(`validate 10k entities after ${leadingCount} other slots`, function* () {
      const leading = kernel.createKernelContext();
      const ctx = kernel.createKernelContext();
      kernel.initializeKernel(leading);
      kernel.initializeKernel(ctx);
      for (let i = 0; i < leadingCount; i++) kernel.createEntity(leading);
      const entities = new Uint32Array(10_000);
      for (let i = 0; i < entities.length; i++) entities[i] = kernel.createEntity(ctx);
      const result = yield () => {
        let alive = 0;
        for (let i = 0; i < entities.length; i++) if (kernel.hasEntity(ctx, entities[i])) alive++;
        return alive;
      };
      assert.equal(result, 10_000);
      kernel.destroyKernel(ctx);
      kernel.destroyKernel(leading);
      return result;
    });
  }
});
