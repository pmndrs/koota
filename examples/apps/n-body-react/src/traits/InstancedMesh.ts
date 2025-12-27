import { trait } from 'koota';
import type * as THREE from 'three';

export const InstancedMesh = trait({ object: () => null! as THREE.InstancedMesh });
