import { Schedule } from 'directed';
import { world } from '../../scene-graph-propagation/world.ts';
import { dirty } from './dirty';
import { propagate } from './propagate';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.add(dirty);
schedule.add(propagate, { after: dirty });
schedule.build();
