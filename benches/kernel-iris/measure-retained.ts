import { createIrisDefinitions, createIrisFixture, createKootaFixture, iris } from './fixtures';
import type * as Kernel from '../../packages/core/src/kernel';
const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);

if (!global.gc) throw new Error('Run with --expose-gc --import tsx');
const engine = process.argv[2];
const shape = process.argv[3] ?? 'scalars';
if (engine !== 'koota' && engine !== 'iris') throw new Error('Choose koota or iris');
if (!['scalars', 'queries', 'pairs', 'unique-pairs', 'plans', 'workspaces'].includes(shape))
  throw new Error('Choose scalars, queries, pairs, unique-pairs, plans or workspaces');
if (engine === 'iris' && (shape === 'plans' || shape === 'workspaces'))
  throw new Error('Prepared plans are a Koota experiment');
const definitions = engine === 'iris' ? createIrisDefinitions() : null;
const plans: Kernel.QueryPlan[] = [];
const workspaces: Kernel.QueryWorkspace[] = [];
global.gc();
const before = process.memoryUsage();
const f =
  engine === 'koota'
    ? createKootaFixture(10_000, 3, 0, shape === 'pairs')
    : createIrisFixture(definitions!, 10_000, 3, 0, shape === 'pairs');
if (shape === 'unique-pairs') {
  if ('ctx' in f) {
    const relation = kernel.defineRelation(f.ctx);
    kernel.reserveKernel(f.ctx, 30_032, 50_000);
    for (const entity of f.entities) {
      const target = kernel.tryCreateEntity(f.ctx);
      const pair = kernel.pairEntity(f.ctx, relation, target);
      if (kernel.tryAttachEntity(f.ctx, entity, pair) !== 1)
        throw new Error('Pair capacity exhausted');
    }
  } else {
    for (const entity of f.entities) {
      const target = iris!.createEntity(f.world);
      iris!.addComponent(f.world, entity, iris!.pair(definitions!.relation, target));
    }
  }
}
if (shape === 'queries' || shape === 'plans' || shape === 'workspaces') {
  const terms = [
    [f.values[0]],
    [f.values[1]],
    [f.values[2]],
    [f.values[0], f.values[1]],
    [f.values[0], f.values[2]],
    [f.values[1], f.values[2]],
    f.values,
  ];
  for (const selection of terms) {
    if ('ctx' in f) {
      if (shape === 'queries') kernel.selectEntities(f.ctx, selection);
      else {
        const plan = kernel.prepareQueryPlan(f.ctx, selection);
        plans[plans.length] = plan;
        if (shape === 'workspaces') {
          const workspace = kernel.createQueryWorkspace(10_000);
          workspaces[workspaces.length] = workspace;
          kernel.visitQueryPlan(plan, workspace, () => {});
        }
      }
    } else iris!.EXPERIMENTAL_queryEntities(f.world, selection, () => {});
  }
}
global.gc();
const after = process.memoryUsage();
for (let i = 0; i < plans.length; i++) {
  if (kernel.collectQueryPlanInto(plans[i], []) !== 10_000) throw new Error('Incomplete plan');
  if (workspaces[i] && kernel.visitQueryPlan(plans[i], workspaces[i], () => {}) !== 10_000)
    throw new Error('Incomplete workspace');
}
if ('ctx' in f) {
  if (!kernel.hasEntityTrait(f.ctx, f.entities[9_999], f.values[2]))
    throw new Error('Incomplete population');
} else if (!iris!.hasComponent(f.world, f.entities[9_999], f.values[2]))
  throw new Error('Incomplete population');
console.log(
  JSON.stringify({
    engine,
    shape,
    source:
      engine === 'iris' ? process.env.IRIS_SOURCE : (process.env.KOOTA_KERNEL_SOURCE ?? 'production'),
    count: f.entities.length,
    heapBytes: after.heapUsed - before.heapUsed,
    arrayBufferBytes: after.arrayBuffers - before.arrayBuffers,
    retainedBytes: after.heapUsed - before.heapUsed + after.arrayBuffers - before.arrayBuffers,
  })
);
if ('ctx' in f) kernel.destroyKernel(f.ctx);
else iris!.resetWorld(f.world);
