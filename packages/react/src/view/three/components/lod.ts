import { define } from '@koota/core';
import * as THREE from 'three';

export const LOD = define<{ object: THREE.LOD }>({ object: null! });
