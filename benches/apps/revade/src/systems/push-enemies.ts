import { Entity, World } from 'koota';
import * as THREE from 'three';
import { IsEnemy, IsPlayer, Movement, SpatialHashMap, Transform } from '../traits';

const collisionRadius = 2;
const pushStrength = 0.1;
const pushForce = new THREE.Vector3();

export const pushEnemies = ({ world }: { world: World }) => {
	const spatialHashMap = world.get(SpatialHashMap);

	world.query(IsPlayer, Transform, Movement).updateEach(([{ position }, { velocity }]) => {
		// Get nearby entities
		const nearbyEntities: any[] = [];
		spatialHashMap.getNearbyEntities(
			position.x,
			position.y,
			position.z,
			collisionRadius, // You'll need to add this to Player trait
			nearbyEntities
		);

		// Filter for enemies within collision range
		const collidingEnemies: Entity[] = nearbyEntities.filter((entity) => {
			return (
				entity.has(IsEnemy) &&
				entity.get(Transform).position.distanceTo(position) <= collisionRadius
			);
		});

		// Apply push force to colliding enemies
		for (const enemy of collidingEnemies) {
			const enemyTransform = enemy.get(Transform);
			const enemyMovement = enemy.get(Movement);

			// Calculate push direction (away from player)
			pushForce
				.copy(enemyTransform.position)
				.sub(position)
				.normalize()
				.multiplyScalar(velocity.length() * pushStrength);

			// Apply push force to enemy
			enemyMovement.force.add(pushForce);
		}
	});
};
