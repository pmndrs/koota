import { trait } from 'koota';
import * as THREE from 'three';

export const Forces = trait({
	coherence: () => new THREE.Vector3(),
	separation: () => new THREE.Vector3(),
	alignment: () => new THREE.Vector3(),
	avoidEdges: () => new THREE.Vector3(),
});
