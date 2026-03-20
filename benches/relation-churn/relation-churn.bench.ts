import { bench, group } from '@pmndrs/labs';
import { init } from './systems/init.ts';
import { schedule } from './systems/schedule.ts';
import { world } from './world.ts';

group('relation churn @relation', () => {
    init({ world });
	bench(() => {
        schedule.run({ world });
    }).gc('inner');
});
