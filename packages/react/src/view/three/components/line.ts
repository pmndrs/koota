import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Line = define<{ object: THREE.Line }>({ object: null! });
