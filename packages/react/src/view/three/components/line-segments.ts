import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const LineSegments = define<{ object: THREE.LineSegments }>({ object: null! });
