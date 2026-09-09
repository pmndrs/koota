import { assert, bench, group } from '@pmndrs/labs';
import type * as Kernel from '../../packages/core/src/kernel';

// An alternate checkout can run exactly the same workload without replacing source files.
const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);

function fixture() {
  const ctx = kernel.createKernelContext();
  kernel.initializeKernel(ctx);
  const Relation = {
    [kernel.$relation]: true as const,
    [kernel.$internal]: {
      trait: kernel.createTrait(),
      exclusive: false,
      autoDestroy: false as const,
    },
  };
  Relation[kernel.$internal].trait[kernel.$internal].relation = Relation;
  return { ctx, Relation };
}

group('kernel relation indexes @kernel-workflows', () => {
  bench('warm high fan-out remove and attach 10k', function* () {
    const { ctx, Relation } = fixture();
    const subject = kernel.createEntity(ctx);
    const pairs = Array.from({ length: 10_000 }, () => ({
      [kernel.$relationPair]: true as const,
      relation: Relation,
      target: kernel.createEntity(ctx),
    }));
    for (const pair of pairs) kernel.addTrait(ctx, subject, pair);
    yield () => {
      for (let i = 0; i < pairs.length; i++) {
        kernel.removeTrait(ctx, subject, pairs[i]);
        kernel.addTrait(ctx, subject, pairs[i]);
      }
    };
    assert.equal(kernel.getRelationTargets(ctx, Relation, subject).length, pairs.length);
    kernel.destroyKernel(ctx);
  });
  bench('destroy target with 10k incoming relations', function* () {
    const { ctx, Relation } = fixture();
    const subjects = Array.from({ length: 10_000 }, () => kernel.createEntity(ctx));
    let target = 0;
    const populate = () => {
      target = kernel.createEntity(ctx);
      const pair = { [kernel.$relationPair]: true as const, relation: Relation, target };
      for (const subject of subjects) kernel.addTrait(ctx, subject, pair);
    };
    populate();
    yield {
      manual: () => {
        const start = performance.now();
        kernel.destroyEntity(ctx, target);
        return (performance.now() - start) * 1e6;
      },
      after: populate,
    };
    assert.equal(kernel.getRelationTargets(ctx, Relation, subjects[0]).length, 1);
    kernel.destroyKernel(ctx);
  });
});
