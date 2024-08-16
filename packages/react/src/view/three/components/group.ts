import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Group = define<{ object: THREE.Group }>({ object: null! });
