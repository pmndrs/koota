import { Object3D } from './object-3d';

export class Line extends Object3D {
	object: THREE.Line;

	constructor(object: THREE.Line) {
		super(object);
		this.object = object;
	}
}
