import { Schedule } from 'directed';
import { setInitial } from './setInitial';
import { updateGravity } from './updateGravity';
import { moveBodies } from './moveBodies';
import { updateColor } from './updateColor';
import { updateTime } from './updateTime';
import { init } from './init';
import { handleExplosions } from './handleExplosions';

export const schedule = new Schedule<{ world: Koota.World }>();

schedule.createTag('init');
schedule.createTag('update', { after: 'init' });

schedule.add(init, { tag: 'init', before: 'update' });
schedule.add(setInitial, { tag: 'init', after: init, before: 'update' });

schedule.add(updateTime, { tag: 'update' });
schedule.add(updateGravity, { after: setInitial, tag: 'update' });
schedule.add(handleExplosions, { after: updateGravity, tag: 'update' });
schedule.add(moveBodies, { after: handleExplosions, tag: 'update' });
schedule.add(updateColor, { after: moveBodies, tag: 'update' });

schedule.build();
