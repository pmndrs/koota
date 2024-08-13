import { Object3D } from './object-3d';

export class Mesh extends Object3D {
	object: THREE.Mesh;

	constructor(object: THREE.Mesh) {
		super(object);
		this.object = object;
	}
}
