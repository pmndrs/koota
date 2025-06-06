import { Schedule } from 'directed';
import type { World } from 'koota';
import { init } from './init';
import { moveBodies } from './moveBodies';
import { recycleBodiesSim } from './recycleBodies';
import { setInitial } from './setInitial';
import { updateGravity } from './updateGravity';
import { updateTime } from './updateTime';

export const schedule = new Schedule<{ world: World }>();

schedule.createTag('init');
schedule.createTag('update', { after: 'init' });
schedule.createTag('end', { after: 'update' });

schedule.add(init, { tag: 'init' });
schedule.add(setInitial, { tag: 'init', after: init });

schedule.add(updateTime, { tag: 'update' });
schedule.add(updateGravity, { after: updateTime, tag: 'update' });
schedule.add(moveBodies, { after: updateGravity, tag: 'update' });

schedule.add(recycleBodiesSim, { tag: 'end', after: 'update' });

schedule.build();
