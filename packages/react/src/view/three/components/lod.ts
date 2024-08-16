import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const LOD = define<{ object: THREE.LOD }>({ object: null! });
