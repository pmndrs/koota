import type { World } from 'koota';
import { actions } from '../actions';
import { IsPlayer, Time } from '../traits';
import { between } from '../utils/between';

const SPAWN_INTERVAL = 1;
let accumulatedTime = 0;

export function spawnEnemies(world: World) {
	const { delta } = world.get(Time)!;
	const { spawnEnemy } = actions(world);
	const player = world.queryFirst(IsPlayer);

	accumulatedTime += delta;

	if (accumulatedTime >= SPAWN_INTERVAL) {
		accumulatedTime -= SPAWN_INTERVAL;
		spawnEnemy({ target: player, position: [between(-50, 50), between(-50, 50), 0] });
	}
}
