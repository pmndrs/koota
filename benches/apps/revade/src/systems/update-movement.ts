import type { World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';

const tmpvec3 = new THREE.Vector3();

export function updateMovement(world: World) {
	const { delta } = world.get(Time)!;
	world.query(Transform, Movement).updateEach(([transform, { velocity, maxSpeed, force }]) => {
		// Apply max speed
		velocity.clampLength(0, maxSpeed);
		velocity.add(force);

		// Damp force
		if (force.length() > 0.01) {
			force.multiplyScalar(1 - 0.05);
		} else {
			force.setScalar(0);
		}

		// Apply velocity
		transform.position.add(tmpvec3.copy(velocity).multiplyScalar(delta));
	});
}
