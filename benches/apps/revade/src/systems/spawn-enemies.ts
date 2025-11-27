import type { World } from 'koota';
import { actions } from '../actions';
import { IsPlayer } from '../traits';
import { Time } from '../traits/time';

const SPAWN_INTERVAL = 1;
let accumulatedTime = 0;

export const spawnEnemies = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	const { spawnEnemy } = actions(world);
	const player = world.queryFirst(IsPlayer);

	accumulatedTime += delta;

	if (accumulatedTime >= SPAWN_INTERVAL) {
		accumulatedTime -= SPAWN_INTERVAL;
		spawnEnemy({ target: player });
	}
};
