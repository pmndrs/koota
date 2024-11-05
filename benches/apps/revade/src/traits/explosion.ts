import { trait } from 'koota';
import * as THREE from 'three';

export const Explosion = trait({
	duration: 500,
	current: 0,
	count: 12,
	velocities: () => [] as THREE.Vector3[],
});
