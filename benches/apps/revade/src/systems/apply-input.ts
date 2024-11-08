import { World } from 'koota';
import { IsPlayer, Transform, Movement, Input, Time } from '../traits';
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmpvec3 = new THREE.Vector3();

export const applyInput = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	world
		.query(IsPlayer, Input, Transform, Movement)
		.updateEach(([input, transform, { velocity, thrust }]) => {
			velocity.add(tmpvec3.set(input.direction.x, input.direction.y, 0).multiplyScalar(thrust * delta * 100));
			transform.quaternion.setFromUnitVectors(UP, velocity.clone().normalize());
		});
};
