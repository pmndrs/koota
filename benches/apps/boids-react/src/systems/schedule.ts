import { Schedule } from 'directed';
import type { World } from 'koota';
import { applyForces } from './apply-forces';
import { avoidEdges } from './avoid-edges';
import { moveBoids } from './move-boids';
import { syncThreeObjects } from './sync-three-object';
import { updateAlignment } from './update-alignment';
import { updateCoherence } from './update-coherence';
import { updateNeighbors } from './update-neighbors';
import { updateSeparation } from './update-separation';
import { updateSpatialHashing } from './update-spatial-hashing';
import { updateTime } from './update-time';

export const schedule = new Schedule<{ world: World }>();

schedule.add(updateTime);
schedule.add(updateSpatialHashing);
schedule.add(updateNeighbors);
// schedule.add(updateCoherence);
// schedule.add(updateSeparation);
// schedule.add(updateAlignment);
schedule.add(avoidEdges);
schedule.add(applyForces);
schedule.add(moveBoids);
schedule.add(syncThreeObjects);

schedule.build();
