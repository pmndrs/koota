import { Relation } from '../relation/types';
import { ConfigurableTrait, ExtractSchema, Trait, TraitInstance, TraitValue } from '../trait/types';

export type Entity = number & {
	add: (...traits: ConfigurableTrait[]) => void;
	remove: (...traits: Trait[]) => void;
	has: (trait: Trait) => boolean;
	destroy: () => void;
	changed: (trait: Trait) => void;
	set: <T extends Trait>(
		trait: T,
		value: TraitValue<ExtractSchema<T>>,
		flagChanged?: boolean
	) => void;
	get: <T extends Trait>(trait: T) => TraitInstance<ExtractSchema<T>>;
	targetFor: <T>(relation: Relation<T>) => Entity | undefined;
	targetsFor: <T>(relation: Relation<T>) => Entity[];
	id: () => number;
};
