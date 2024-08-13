import { Line } from './line';

export class LineSegments extends Line {
	object: THREE.LineSegments;

	constructor(object: THREE.LineSegments) {
		super(object);
		this.object = object;
	}
}
