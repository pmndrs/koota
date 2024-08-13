import { Object3D } from './object-3d';

export class Group extends Object3D {
	object: THREE.Group;

	constructor(object: THREE.Group) {
		super(object);
		this.object = object;
	}
}
