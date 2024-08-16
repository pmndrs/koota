import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Points = define<{ object: THREE.Points }>({ object: null! });
