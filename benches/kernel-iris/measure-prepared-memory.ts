import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

if (!process.env.IRIS_SOURCE) throw new Error('Set IRIS_SOURCE');
if (!process.env.KOOTA_BEFORE_SOURCE)
  throw new Error('Set KOOTA_BEFORE_SOURCE to the baseline kernel index.ts');
const current = fileURLToPath(new URL('../../packages/core/src/kernel/index.ts', import.meta.url));
const cases = [
  ['before', 'koota', 'scalars'],
  ['before', 'koota', 'queries'],
  ['after', 'koota', 'scalars'],
  ['after', 'koota', 'queries'],
  ['after', 'koota', 'plans'],
  ['after', 'koota', 'workspaces'],
  ['iris', 'iris', 'scalars'],
  ['iris', 'iris', 'queries'],
];
const samples: {
  block: number;
  variant: string;
  engine: string;
  shape: string;
  source: string;
  count: number;
  heapBytes: number;
  arrayBufferBytes: number;
  retainedBytes: number;
}[] = [];
for (let block = 0; block < 8; block++) {
  for (let i = 0; i < cases.length; i++) {
    const [variant, engine, shape] = cases[block % 2 === 0 ? i : cases.length - i - 1];
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
      {
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          KOOTA_KERNEL_SOURCE: variant === 'before' ? process.env.KOOTA_BEFORE_SOURCE : current,
        },
      }
    );
    if (child.error || child.status !== 0) throw new Error(child.stderr || String(child.error));
    samples.push({ block, variant, ...JSON.parse(child.stdout) });
  }
  console.log(`Retained block ${block + 1}/8 complete`);
}
function median(values: number[]) {
  values.sort((a, b) => a - b);
  return (values[3] + values[4]) / 2;
}
const medians = cases.map(([variant, engine, shape]) => {
  const chosen = samples.filter(
    (sample) => sample.variant === variant && sample.engine === engine && sample.shape === shape
  );
  return {
    variant,
    engine,
    shape,
    heapBytes: median(chosen.map((s) => s.heapBytes)),
    arrayBufferBytes: median(chosen.map((s) => s.arrayBufferBytes)),
    retainedBytes: median(chosen.map((s) => s.retainedBytes)),
  };
});
writeFileSync(
  new URL('./prepared-memory-results.json', import.meta.url),
  JSON.stringify(
    {
      runtime: process.version,
      cpu: cpus()[0].model,
      blocks: 8,
      method:
        'Fresh processes with alternating case order. Full GC heapUsed plus arrayBuffers. 10k entities, three scalar fields, and optionally seven queries or plans. Workspaces retain seven 10k entity and row buffers.',
      samples,
      medians,
    },
    null,
    2
  ) + '\n'
);
console.log(medians);
