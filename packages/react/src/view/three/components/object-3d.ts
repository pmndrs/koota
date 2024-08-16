import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Object3D = define<{ object: THREE.Object3D }>({ object: null! });
