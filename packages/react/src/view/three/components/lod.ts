import { Object3D } from './object-3d';

export class LOD extends Object3D {
	object: THREE.LOD;

	constructor(object: THREE.LOD) {
		super(object);
		this.object = object;
	}
}
