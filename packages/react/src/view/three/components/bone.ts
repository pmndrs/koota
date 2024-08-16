import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Bone = define<{ object: THREE.Bone }>({ object: null! });
