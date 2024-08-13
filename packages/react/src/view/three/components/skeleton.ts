import { Component } from '@sweet-ecs/core';

export class Skeleton extends Component {
	object: THREE.Skeleton;

	constructor(object: THREE.Skeleton) {
		super();
		this.object = object;
	}
}
