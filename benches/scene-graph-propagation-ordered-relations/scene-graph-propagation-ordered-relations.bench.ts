import { bench, group } from '@pmndrs/labs';
import { init } from './systems/init.ts';
import { schedule } from './systems/schedule.ts';
import { world } from '../scene-graph-propagation/world.ts';

group('scene graph propagation ordered relations @scene @graph', () => {
    init({ world });
    bench(() => {
        schedule.run({ world });
    }).gc('inner');
});
