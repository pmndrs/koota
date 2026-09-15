import { bench, group } from '@pmndrs/labs';
import { createSceneGraphContext } from './create-scene-graph-bench.ts';
import { createSchedule } from './systems/schedule.ts';

/**
 * Benchmarks scene-graph-style value propagation over a large synthetic hierarchy:
 * each iteration dirties a small subset of nodes, walks up to collect ancestor state,
 * then propagates updated totals down through descendants using different child storage strategies.
 *
 * Each variant runs in an isolated worker process.
 */
group('scene graph propagation: ChildOf exclusive @scene @graph @relation', () => {
  bench(function* () {
    const ctx = createSceneGraphContext('child-of-exclusive');
    const schedule = createSchedule(ctx);

    yield {
      bench: () => schedule.run({ world: ctx.world }),
      snapshot: ctx.snapshot,
    };

    ctx.world.destroy();
  });
});
