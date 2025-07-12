import { Schedule } from 'directed';
import { world } from '../world';
import { updateTime } from './update-time';
import { moveBoids } from './move-boids';
import { applyForces } from './apply-forces';
import { avoidEdges } from './avoid-edges';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.createTag('update');

schedule.add(updateTime, { before: 'update' });

schedule.add(avoidEdges, { tag: 'update' });
schedule.add(applyForces, { tag: 'update' });
schedule.add(moveBoids, { tag: 'update' });

schedule.build();
