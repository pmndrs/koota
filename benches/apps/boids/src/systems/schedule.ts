import { Schedule } from 'directed';
import { World } from 'koota';
import { applyForces } from './apply-forces';
import { moveBoids } from './move-boids';
import { syncThreeObjects } from './sync-three-object';
import { updateNeighbors } from './update-neighbors';
import { updateSpatialHashing } from './update-spatial-hashing';
import { updateTime } from './update-time';
import { updateCoherence } from './update-coherence';
import { updateSeparation } from './update-separation';
import { updateAlignment } from './update-alignment';
import { avoidEdges } from './avoid-edges';

export const schedule = new Schedule<{ world: World }>();

schedule.add(updateTime);
schedule.add(updateSpatialHashing);
schedule.add(updateNeighbors);
schedule.add(updateCoherence);
schedule.add(updateSeparation);
schedule.add(updateAlignment);
schedule.add(avoidEdges);
schedule.add(applyForces);
schedule.add(moveBoids);
schedule.add(syncThreeObjects);

schedule.build();
