import { trait } from 'koota';
import * as THREE from 'three';

export const Position = trait({ value: () => new THREE.Vector3() });
