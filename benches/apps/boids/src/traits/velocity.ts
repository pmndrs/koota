import { trait } from 'koota';
import * as THREE from 'three';

export const Velocity = trait({ value: () => new THREE.Vector3() });
