import type { World } from 'koota';
import * as THREE from 'three';
import { IsEnemy, IsPlayer, Movement, Transform } from '../traits';

const acceleration = new THREE.Vector3();

export const followPlayer = ({ world }: { world: World }) => {
	const player = world.queryFirst(IsPlayer, Transform);
	if (!player) return;

	const playerTransform = player.get(Transform)!;

	world
		.query(IsEnemy, Transform, Movement)
		.updateEach(([transform, { velocity, thrust, damping }]) => {
			// Apply damping to current velocity
			velocity.multiplyScalar(damping);

			// Calculate and apply acceleration towards player
			acceleration
				.copy(playerTransform.position)
				.sub(transform.position)
				.normalize()
				.multiplyScalar(thrust);

			velocity.add(acceleration);
		});
};
