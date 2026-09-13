import { bench, group } from '@pmndrs/labs';
import { createSceneGraphContext } from './create-scene-graph-bench.ts';
import { createSchedule } from './systems/schedule.ts';

/**
 * Benchmarks scene-graph-style value propagation over a large synthetic hierarchy:
 * each iteration dirties a small subset of nodes, walks up to collect ancestor state,
 * then propagates updated totals down through descendants using different child storage strategies.
 *
 * Keep all storage strategies in this file so Labs can interleave their measurements.
 */
group('scene graph propagation @scene @graph @relation', () => {
  for (const strategy of [
    'child-of-exclusive',
    'child-of-not-exclusive',
    'ordered-relation',
  ] as const) {
    bench(strategy, function* () {
      const ctx = createSceneGraphContext(strategy);
      const schedule = createSchedule(ctx);

      yield {
        bench: () => schedule.run({ world: ctx.world }),
        snapshot: ctx.snapshot,
      };

      ctx.world.destroy();
    });
  }
});
