import { pathToFileURL } from 'node:url';

const { HiSparseBitSet } = await import(
  process.env.KOOTA_BITSET_SOURCE
    ? pathToFileURL(process.env.KOOTA_BITSET_SOURCE).href
    : '../../packages/collections/src/hi-sparse-bitset.ts'
);

if (!global.gc) throw new Error('Run with --expose-gc.');
const retained: unknown[] = [];
const results = [];
for (const [name, count, stride] of [
  ['empty', 0, 1],
  ['dense 10k', 10_000, 1],
  ['sparse 10k across 1m', 10_000, 100],
] as const) {
  for (let i = 0; i < 5; i++) global.gc();
  const before = process.memoryUsage();
  for (let i = 0; i < 100; i++) {
    const set = new HiSparseBitSet();
    for (let j = 0; j < count; j++) set.insert(j * stride);
    retained.push(set);
  }
  for (let i = 0; i < 5; i++) global.gc();
  const after = process.memoryUsage();
  results.push({
    name,
    count: 100,
    heapBytesPerSet: (after.heapUsed - before.heapUsed) / 100,
    arrayBufferBytesPerSet: (after.arrayBuffers - before.arrayBuffers) / 100,
  });
}
let checksum = 0;
for (const set of retained as { size: number }[]) checksum += set.size;
console.log(JSON.stringify({ results, sets: retained.length, checksum }));
