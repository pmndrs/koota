import { define } from '@koota/core';
import * as THREE from 'three';

export const Mesh = define<{ object: THREE.Mesh }>({ object: null! });
