import { Schedule } from 'directed';
import { World } from 'koota';
import { applyForces } from './apply-forces';
import { moveBoids } from './move-boids';
import { syncThreeObjects } from './sync-three-object';
import { updateNeighbors } from './update-neighbors';
import { updateSpatialHashing } from './update-spatial-hashing';
import { updateTime } from './update-time';

export const schedule = new Schedule<{ world: World }>();

schedule.add(updateTime);
schedule.add(updateSpatialHashing, { after: updateTime });
schedule.add(updateNeighbors, { after: updateSpatialHashing });
schedule.add(applyForces, { after: updateNeighbors });
schedule.add(moveBoids, { after: applyForces });
schedule.add(syncThreeObjects, { after: moveBoids });

schedule.build();
