import { World } from 'koota';
import { useActions } from '../actions';
import { Time } from '../traits/time';

const SPAWN_INTERVAL = 1;
let accumulatedTime = 0;

export const spawnEnemies = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	const { spawnEnemy } = useActions.get(world);

	accumulatedTime += delta;

	if (accumulatedTime >= SPAWN_INTERVAL) {
		accumulatedTime -= SPAWN_INTERVAL;
		spawnEnemy();
	}
};
