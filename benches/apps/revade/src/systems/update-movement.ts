import { World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';

const tmpvec3 = new THREE.Vector3();

export const updateMovement = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	world.query(Transform, Movement).updateEach(([transform, { velocity, maxSpeed }]) => {
		// Apply max speed.
		velocity.clampLength(0, maxSpeed);

		// Apply velocity.
		transform.position.add(tmpvec3.copy(velocity).multiplyScalar(delta));
	});
};
