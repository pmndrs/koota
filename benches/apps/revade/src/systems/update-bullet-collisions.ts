import { World } from 'koota';
import {Bullet, Explosion, IsEnemy, IsPlayer, SpatialHashMap, Transform} from '../traits';
import { between } from '../utils/between';
import {Score} from "../traits/score.ts";
import {ScoreFade} from "../traits/score-fade.ts";

export const updateBulletCollisions = ({ world }: { world: World }) => {
	const spatialHashMap = world.get(SpatialHashMap);

	world
		.query(Bullet, Transform)
		.select(Transform)
		.updateEach(([{ position }], entity) => {
			const nearbyEntities = spatialHashMap.getNearbyEntities(
				position.x,
				position.y,
				position.z,
				5
			);

			const hitEnemy = nearbyEntities.find(
				(entity) =>
					entity.has(IsEnemy) && entity.get(Transform).position.distanceTo(position) < 1
			);

			if (hitEnemy !== undefined) {
				// increase score
				const player = world.queryFirst(Score, IsPlayer);
				if (player !== undefined) {
					player.set(Score, {current: player.get(Score).current + 10}, true);
				}






				// Spawn explosion in enemy's position.
				world.spawn(
					Explosion({ count: Math.floor(between(12, 20)) }),
					Transform({ position: hitEnemy.get(Transform).position.clone() }),
					ScoreFade({ position: hitEnemy.get(Transform).position.clone() })
				);



				// Destroy bullet and enemy.
				hitEnemy.destroy();
				entity.destroy();
			}
		});
};
