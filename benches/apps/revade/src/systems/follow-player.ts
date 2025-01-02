import { World } from 'koota';
import { IsEnemy, Movement, Transform } from '../traits';
import { IsPlayer } from '../traits';
import * as THREE from 'three';

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
