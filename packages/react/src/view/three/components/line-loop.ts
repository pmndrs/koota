import { Line } from './line';

export class LineLoop extends Line {
	object: THREE.LineLoop;

	constructor(object: THREE.LineLoop) {
		super(object);
		this.object = object;
	}
}
