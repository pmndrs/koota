import { bench, group } from '@pmndrs/labs';
import { createSceneGraphContext } from './create-scene-graph-bench.ts';
import { createSchedule } from './systems/schedule.ts';

/**
 * Benchmarks scene-graph-style value propagation over a large synthetic hierarchy:
 * each iteration dirties a small subset of nodes, walks up to collect ancestor state,
 * then propagates updated totals down through descendants using different child storage strategies.
 *
 * Each variant is in its own file for process isolation (labs runs each .bench.ts separately).
 */
group('scene graph propagation: ChildOf exclusive @scene @graph @relation', () => {
    const ctx = createSceneGraphContext('child-of-exclusive');
    const schedule = createSchedule(ctx);

    bench('ChildOf exclusive', () => {
        schedule.run({ world: ctx.world });
    }).gc('inner');
});
