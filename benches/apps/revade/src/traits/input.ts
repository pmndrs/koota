import {trait} from 'koota';
import * as THREE from 'three';

export const Input = trait({
  direction: () => new THREE.Vector2(),
  isFiring: false
});
