import { Mesh } from './mesh';

export class BatchedMesh extends Mesh {
	object: THREE.BatchedMesh;

	constructor(object: THREE.BatchedMesh) {
		super(object);
		this.object = object;
	}
}
