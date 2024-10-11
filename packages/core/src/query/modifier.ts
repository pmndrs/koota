import { Trait } from '../trait/types';
import { $internal } from '../common';

export class ModifierData<TTrait extends Trait[] = Trait[], TType extends string = string> {
	traitIds: number[];

	constructor(public type: TType, public id: number, public traits: TTrait) {
		this.traitIds = traits.map((trait) => trait[$internal].id);
	}
}
