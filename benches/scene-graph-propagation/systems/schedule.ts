import { Schedule } from 'directed';
import type { SceneGraphContext } from '../create-scene-graph-bench.ts';

export function createSchedule({ dirty, propagate }: SceneGraphContext) {
    const schedule = new Schedule<{ world: SceneGraphContext['world'] }>();
    schedule.add(dirty);
    schedule.add(propagate, { after: dirty });
    schedule.build();
    return schedule;
}
