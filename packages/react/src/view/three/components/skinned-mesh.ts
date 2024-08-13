import { Mesh } from './mesh';

export class SkinnedMesh extends Mesh {
	object: THREE.SkinnedMesh;

	constructor(object: THREE.SkinnedMesh) {
		super(object);
		this.object = object;
	}
}
