import { Schedule } from 'directed';
import { world } from '../world';
import { move } from './move';
import { updateNeighbors } from './update-neighbors';
import { consumeNeighbors } from './consume-neighbors';

export const schedule = new Schedule<{ world: typeof world }>();

schedule.add(updateNeighbors);
schedule.add(consumeNeighbors, { after: updateNeighbors });
schedule.add(move, { after: consumeNeighbors });
schedule.build();
