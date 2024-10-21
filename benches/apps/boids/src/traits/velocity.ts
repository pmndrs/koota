import { trait } from 'koota';
import * as THREE from 'three';

export const Velocity = trait(() => {
	const vel = new THREE.Vector3();
	console.log(vel);
	return vel;
});
