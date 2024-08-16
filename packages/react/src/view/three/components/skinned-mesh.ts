import { define } from '@sweet-ecs/core';

import * as THREE from 'three';
export const SkinnedMesh = define<{ object: THREE.SkinnedMesh }>({ object: null! });
