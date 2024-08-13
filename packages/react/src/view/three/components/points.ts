import { Object3D } from './object-3d';

export class Points extends Object3D {
	object: THREE.Points;

	constructor(object: THREE.Points) {
		super(object);
		this.object = object;
	}
}
