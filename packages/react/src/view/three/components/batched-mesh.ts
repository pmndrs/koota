import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const BatchedMesh = define<{ object: THREE.BatchedMesh }>({ object: null! });
