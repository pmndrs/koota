import { World } from 'koota';
import { IsPlayer, Transform, Movement, Input } from '../traits';
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmpvec3 = new THREE.Vector3();

export const applyInput = ({ world }: { world: World }) => {
	world
		.query(IsPlayer, Input, Transform, Movement)
		.updateEach(([input, transform, { velocity, thrust }]) => {
			velocity.add(tmpvec3.set(input.x, input.y, 0).multiplyScalar(thrust));
			transform.quaternion.setFromUnitVectors(UP, velocity.clone().normalize());
		});
};
