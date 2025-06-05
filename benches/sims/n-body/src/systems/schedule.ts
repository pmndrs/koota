import { Schedule } from 'directed';
import { setInitial } from './setInitial';
import { updateGravity } from './updateGravity';
import { moveBodies } from './moveBodies';
import { updateColor } from './updateColor';
import { updateTime } from './updateTime';
import { init } from './init';
import { handleRepulse } from './handleRepulse';
import type { World } from 'koota';

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
