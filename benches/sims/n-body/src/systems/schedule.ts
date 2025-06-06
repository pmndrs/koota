import { Schedule } from 'directed';
import type { World } from 'koota';
import { handleRepulse } from './handleRepulse';
import { init } from './init';
import { moveBodies } from './moveBodies';
import { setInitial } from './setInitial';
import { updateColor } from './updateColor';
import { updateGravity } from './updateGravity';
import { updateTime } from './updateTime';

export const schedule = new Schedule<{ world: World }>();

schedule.createTag('init');
schedule.createTag('update', { after: 'init' });
schedule.createTag('end', { after: 'update' });

schedule.add(init, { tag: 'init', before: 'update' });
schedule.add(setInitial, { tag: 'init', after: init, before: 'update' });

schedule.add(updateTime, { tag: 'update' });
schedule.add(updateGravity, { after: setInitial, tag: 'update' });
schedule.add(handleRepulse, { after: updateGravity, tag: 'update' });
schedule.add(moveBodies, { after: handleRepulse, tag: 'update' });
schedule.add(updateColor, { after: moveBodies, tag: 'update' });

schedule.build();
