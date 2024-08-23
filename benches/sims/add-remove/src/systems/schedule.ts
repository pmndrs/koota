import { Schedule } from 'directed';
import { init } from './init';
import { setInitial } from './setInitial';
import { updateTime } from './updateTime';
import { updateGravity } from './updateGravity';
import { moveBodies } from './moveBodies';
import { recycleBodies } from './recycleBodies';
import { recycleEntities } from './recycleEntities';

export const schedule = new Schedule<{ world: Koota.World }>();

schedule.createTag('init');
schedule.createTag('update', { after: 'init' });
schedule.createTag('end', { after: 'update' });

schedule.add(init, { tag: 'init' });
schedule.add(setInitial, { tag: 'init', after: init });

schedule.add(updateTime, { tag: 'update' });
schedule.add(updateGravity, { after: updateTime, tag: 'update' });
schedule.add(moveBodies, { after: updateGravity, tag: 'update' });

schedule.add(recycleBodies, { tag: 'end', after: 'update' });
schedule.add(recycleEntities, { tag: 'end', after: recycleBodies });

schedule.build();
