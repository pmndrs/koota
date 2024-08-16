import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Skeleton = define<{ object: THREE.Skeleton }>({ object: null! });
