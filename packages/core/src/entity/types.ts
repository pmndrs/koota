import type { Relation } from '../relation/types';
import type { ConfigurableTrait, ExtractSchema, Trait, TraitInstance, TraitValue } from '../trait/types';

export type Entity = number & {
	add: (...traits: ConfigurableTrait[]) => void;
	remove: (...traits: Trait[]) => void;
	has: (trait: Trait) => boolean;
	destroy: () => void;
	changed: (trait: Trait) => void;
	set: <T extends Trait>(
		trait: T,
		value:
			| TraitValue<ExtractSchema<T>>
			| ((prev: TraitInstance<ExtractSchema<T>>) => TraitValue<ExtractSchema<T>>),
		flagChanged?: boolean
	) => void;
	get: <T extends Trait | Relation<Trait>>(trait: T) => TraitInstance<ExtractSchema<T>> | undefined;
	targetFor: <T extends Trait>(relation: Relation<T>) => Entity | undefined;
	targetsFor: <T extends Trait>(relation: Relation<T>) => Entity[];
	id: () => number;
	generation: () => number;
	isAlive: () => boolean;
};
