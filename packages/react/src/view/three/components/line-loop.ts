import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const LineLoop = define<{ object: THREE.LineLoop }>({ object: null! });
