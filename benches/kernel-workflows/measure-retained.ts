import type * as Kernel from '../../packages/core/src/kernel';
const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);
if (!global.gc) throw new Error('Run with --expose-gc --import tsx');
const count = Number(process.argv[2] ?? 10_000);
if (!Number.isInteger(count) || count < 1 || count > 1_000_000)
  throw new RangeError('Invalid entity count');
const entities = new Uint32Array(count);
global.gc();
const before = process.memoryUsage();
const ctx = kernel.createKernelContext();
kernel.initializeKernel(ctx);
const traits = [
  kernel.createTrait({ value: 0 }),
  kernel.createTrait({ value: 0 }),
  kernel.createTrait({ value: 0 }),
];
for (let i = 0; i < count; i++) entities[i] = kernel.createEntity(ctx, ...traits);
global.gc();
const after = process.memoryUsage();
if (!kernel.hasTrait(ctx, entities[count - 1], traits[2])) throw new Error('Incomplete population');
console.log(
  JSON.stringify({
    source: process.env.KOOTA_KERNEL_SOURCE ?? 'production',
    count,
    heapBytes: after.heapUsed - before.heapUsed,
    arrayBufferBytes: after.arrayBuffers - before.arrayBuffers,
    retainedBytes: after.heapUsed - before.heapUsed + after.arrayBuffers - before.arrayBuffers,
  })
);
kernel.destroyKernel(ctx);
