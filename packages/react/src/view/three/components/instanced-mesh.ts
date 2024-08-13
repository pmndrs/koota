import { Mesh } from './mesh';

export class InstancedMesh extends Mesh {
	object: THREE.InstancedMesh;

	constructor(object: THREE.InstancedMesh) {
		super(object);
		this.object = object;
	}
}
