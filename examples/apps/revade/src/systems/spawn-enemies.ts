import type { World } from 'koota';
import { actions } from '../actions';
import { EnemySpawner, IsEnemy, IsPlayer, Time } from '../traits';
import { between } from '../utils/between';

export function spawnEnemies(world: World) {
    const { spawnEnemy } = actions(world);

    const time = world.get(Time);
    const spawner = world.get(EnemySpawner);
    const player = world.queryFirst(IsPlayer);

    if (!time || !spawner) return;

    const count = world.query(IsEnemy).length;
    if (count >= spawner.max) return;

    spawner.accumulatedTime += time.delta;

    if (spawner.accumulatedTime >= spawner.interval) {
        spawner.accumulatedTime -= spawner.interval;
        spawnEnemy({ target: player, position: [between(-50, 50), between(-50, 50), 0] });
    }

    world.set(EnemySpawner, spawner);
}
