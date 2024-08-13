import { Object3D } from './object-3d';

export class Sprite extends Object3D {
	object: THREE.Sprite;

	constructor(object: THREE.Sprite) {
		super(object);
		this.object = object;
	}
}
