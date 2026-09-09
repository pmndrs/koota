import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

if (!process.env.IRIS_SOURCE) throw new Error('Set IRIS_SOURCE to the Iris source index.ts');
const samples: {
  engine: string;
  shape: string;
  count: number;
  heapBytes: number;
  arrayBufferBytes: number;
  retainedBytes: number;
}[] = [];
for (let block = 0; block < 8; block++) {
  for (const shape of ['scalars', 'queries', 'pairs', 'unique-pairs']) {
    for (const engine of block % 2 === 0 ? ['koota', 'iris'] : ['iris', 'koota']) {
      const child = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          '--import',
          'tsx',
          fileURLToPath(new URL('./measure-retained.ts', import.meta.url)),
          engine,
          shape,
        ],
        { encoding: 'utf8', timeout: 60_000 }
      );
      if (child.error || child.status !== 0) throw new Error(child.stderr || String(child.error));
      samples.push(JSON.parse(child.stdout));
    }
  }
  console.log(`Retained block ${block + 1}/8 complete`);
}
function median(values: number[]) {
  values.sort((a, b) => a - b);
  return (values[3] + values[4]) / 2;
}
const medians = [];
for (const shape of ['scalars', 'queries', 'pairs', 'unique-pairs']) {
  for (const engine of ['koota', 'iris']) {
    const selected = samples.filter((sample) => sample.engine === engine && sample.shape === shape);
    medians.push({
      engine,
      shape,
      heapBytes: median(selected.map((s) => s.heapBytes)),
      arrayBufferBytes: median(selected.map((s) => s.arrayBufferBytes)),
      retainedBytes: median(selected.map((s) => s.retainedBytes)),
    });
  }
}
writeFileSync(
  new URL('./retained-results.json', import.meta.url),
  JSON.stringify(
    {
      runtime: process.version,
      cpu: cpus()[0].model,
      blocks: 8,
      method:
        'Fresh process, full GC, heapUsed plus arrayBuffers. Includes context, component registration and a common 40kB caller entity buffer. Imported module state and Iris global definitions excluded.',
      samples,
      medians,
    },
    null,
    2
  ) + '\n'
);
console.log(medians);
