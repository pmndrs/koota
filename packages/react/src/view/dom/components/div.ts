import { Component } from '@sweet-ecs/core';

export class Div extends Component {
	object: HTMLDivElement;

	constructor(object: HTMLDivElement) {
		super();
		this.object = object;
	}
}
