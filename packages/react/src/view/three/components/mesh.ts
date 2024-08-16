import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Mesh = define<{ object: THREE.Mesh }>({ object: null! });
