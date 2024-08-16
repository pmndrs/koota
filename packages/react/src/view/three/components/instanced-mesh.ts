import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const InstancedMesh = define<{ object: THREE.InstancedMesh }>({ object: null! });
