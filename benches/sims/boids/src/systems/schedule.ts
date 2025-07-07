import { Schedule } from 'directed';
import { world } from '../world';
import { updateTime } from './update-time';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.createTag('update');

schedule.add(updateTime, { before: 'update' });

schedule.build();
