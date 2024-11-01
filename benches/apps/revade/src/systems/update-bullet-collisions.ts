import { World } from 'koota';
import { Bullet, IsEnemy, SpatialHashMap, Transform } from '../traits';

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
				2
			);

			const hitEnemy = nearbyEntities.find(
				(entity) =>
					entity.has(IsEnemy) && entity.get(Transform).position.distanceTo(position) < 1
			);

			if (hitEnemy) {
				hitEnemy.destroy();
				entity.destroy();
			}
		});
};
