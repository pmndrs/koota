import { required, trait } from 'koota';
import type * as THREE from 'three';

export const InstancedMesh = trait(required<THREE.InstancedMesh>());
