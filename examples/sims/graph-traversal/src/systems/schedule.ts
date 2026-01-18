import { Schedule } from 'directed';
import { world } from '../world';
import { traverse } from './traverse';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.add(traverse);

schedule.build();
