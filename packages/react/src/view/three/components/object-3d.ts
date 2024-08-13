import { Component } from '@sweet-ecs/core';

export class Object3D extends Component {
	object: THREE.Object3D;

	constructor(object: THREE.Object3D) {
		super();
		this.object = object;
	}
}
