import { bench, group, run } from 'mitata';
import { init } from './systems/init';
import { schedule } from './systems/schedule';
import { world } from './world';

group('relation-churn', () => {
	init({ world });
	bench('', () => {
		schedule.run({ world });
	}).gc('inner');
});

await run();
