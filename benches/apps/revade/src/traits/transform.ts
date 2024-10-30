import { trait } from 'koota';
import * as THREE from 'three';

export const Transform = trait({
	position: () => new THREE.Vector3(),
	rotation: () => new THREE.Euler(),
	quaternion: () => new THREE.Quaternion(),
});
