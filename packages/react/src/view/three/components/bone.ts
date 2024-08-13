import { Object3D } from './object-3d';

export class Bone extends Object3D {
	object: THREE.Bone;

	constructor(object: THREE.Bone) {
		super(object);
		this.object = object;
	}
}
