import { trait } from 'koota';
import * as THREE from 'three';

export const Movement = trait({
	velocity: () => new THREE.Vector3(),
	thrust: 1,
	maxSpeed: 10,
	damping: 0.9,
});
