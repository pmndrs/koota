import { Trait, ConfigurableTrait, TraitInstanceFromSchema, ExtractSchema } from '../trait/types';
import { Relation } from '../relation/types';

export type Entity = number & {
	add: (...traits: ConfigurableTrait[]) => void;
	remove: (...traits: Trait[]) => void;
	has: (trait: Trait) => boolean;
	destroy: () => void;
	changed: (trait: Trait) => void;
	set: <T extends Trait>(
		trait: T,
		value: Partial<TraitInstanceFromSchema<ExtractSchema<T>>>,
		flagChanged?: boolean
	) => void;
	get: <T extends Trait>(trait: T) => TraitInstanceFromSchema<ExtractSchema<T>>;
	targetFor: <T>(relation: Relation<T>) => Entity | undefined;
	targetsFor: <T>(relation: Relation<T>) => Entity[];
	id: () => number;
};
