import { define } from '@koota/core';
import * as THREE from 'three';

export const BatchedMesh = define<{ object: THREE.BatchedMesh }>({ object: null! });
