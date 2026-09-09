import { createModel } from './create-model';

if (!global.gc) throw new Error('Run with node --expose-gc --import tsx');

const count = Number(process.argv[2] ?? 10_000);
if (!Number.isInteger(count) || count < 1 || count > 1_000_000)
  throw new RangeError('Expected an entity count from 1 to 1000000');

// Keep harness storage outside the measured interval and consume the model after GC.
const entities = new Float64Array(count);
global.gc();
const before = process.memoryUsage();
const model = createModel(count + 16, count * 3);
const first = model.define();
const second = model.define();
const third = model.define();
for (let i = 0; i < count; i++) {
  const entity = model.spawn();
  entities[i] = entity;
  model.attach(entity, first);
  model.attach(entity, second);
  model.attach(entity, third);
}
global.gc();
const after = process.memoryUsage();
if (!model.has(entities[count - 1], third)) throw new Error('Incomplete population');
const heapBytes = after.heapUsed - before.heapUsed;
const arrayBufferBytes = after.arrayBuffers - before.arrayBuffers;
console.log(
  JSON.stringify({
    mode: process.env.KOOTA_ENTITY_MODEL ?? 'typed',
    entities: count,
    heapBytes,
    arrayBufferBytes,
    retainedBytes: heapBytes + arrayBufferBytes,
    bytesPerEntity: (heapBytes + arrayBufferBytes) / count,
  })
);
model.dispose();
