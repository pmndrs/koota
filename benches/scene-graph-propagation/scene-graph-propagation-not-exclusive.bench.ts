import { bench, group } from '@pmndrs/labs';
import { createSceneGraphContext } from './create-scene-graph-bench.ts';
import { createSchedule } from './systems/schedule.ts';

/** @see scene-graph-propagation.bench.ts for description. */
group('scene graph propagation: ChildOf not exclusive @scene @graph @relation', () => {
    const ctx = createSceneGraphContext('child-of-not-exclusive');
    const schedule = createSchedule(ctx);

    bench(() => {
        schedule.run({ world: ctx.world });
    }).gc('inner');
});
