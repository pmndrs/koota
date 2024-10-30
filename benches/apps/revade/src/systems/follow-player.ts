import { World } from 'koota';
import { IsEnemy, Movement, Transform } from '../traits';
import { IsPlayer } from '../traits';
import * as THREE from 'three';

const acceleration = new THREE.Vector3();

export const followPlayer = ({ world }: { world: World }) => {
	const player = world.queryFirst(IsPlayer, Transform);
	if (!player) return;

	const playerTransform = player.get(Transform);

	world.query(IsEnemy, Transform, Movement).updateEach(([transform, { velocity }]) => {
		acceleration.setScalar(0);
		acceleration.copy(playerTransform.position).sub(transform.position).multiplyScalar(0.5);
		velocity.add(acceleration);
	});
};
