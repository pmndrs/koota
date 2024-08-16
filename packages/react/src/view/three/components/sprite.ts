import { define } from '@sweet-ecs/core';
import * as THREE from 'three';

export const Sprite = define<{ object: THREE.Sprite }>({ object: null! });
