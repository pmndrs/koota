import { Schedule } from 'directed';
import { world } from '@bench/scene-graph-propagation';
import { dirty } from './dirty';
import { propagate } from './propagate';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.add(dirty);
schedule.add(propagate, { after: dirty });
schedule.build();
