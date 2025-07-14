import { Schedule } from 'directed';
import { world } from '../world';
import { updateTime } from './update-time';
import { moveBoids } from './move-boids';
import { applyForces } from './apply-forces';
import { avoidEdges } from './avoid-edges';
import { updateNeighbors } from './update-neighbors';
import { updateCoherence } from './update-coherence';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.createTag('update');

schedule.add(updateTime, { before: 'update' });

schedule.add(updateNeighbors, { tag: 'update' });
schedule.add(updateCoherence, { tag: 'update' });
schedule.add(avoidEdges, { tag: 'update' });
schedule.add(applyForces, { tag: 'update' });
schedule.add(moveBoids, { tag: 'update' });

schedule.build();
