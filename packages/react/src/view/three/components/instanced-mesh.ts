import { define } from '@koota/core';
import * as THREE from 'three';

export const InstancedMesh = define<{ object: THREE.InstancedMesh }>({ object: null! });
