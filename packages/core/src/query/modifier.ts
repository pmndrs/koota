import { Component } from '../component/types';
import { $internal } from '../world/symbols';

export class ModifierData<TComp extends Component[] = Component[], TType extends string = string> {
	componentIds: number[];

	constructor(public type: TType, public id: number, public components: TComp) {
		this.componentIds = components.map((component) => component[$internal].id);
	}
}
