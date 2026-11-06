import { required, trait } from 'koota';
import type * as THREE from 'three';

export const Points = trait({ object: required<THREE.Points>() });
