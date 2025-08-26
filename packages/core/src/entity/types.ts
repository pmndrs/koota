import type { Relation } from '../relation/types';
import type {
	ConfigurableTrait,
	ExtractSchema,
	SetTraitCallback,
	Trait,
	TraitRecord,
	TraitValue,
} from '../trait/types';

export type Entity = number & {
	add: (...traits: ConfigurableTrait[]) => void;
	remove: (...traits: Trait[]) => void;
	has: (trait: Trait) => boolean;
	destroy: () => void;
	changed: (trait: Trait) => void;
	set: <T extends Trait>(
		trait: T,
		value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
		flagChanged?: boolean
	) => void;
	get: <T extends Trait | Relation<Trait>>(trait: T) => TraitRecord<ExtractSchema<T>> | undefined;
	targetFor: <T extends Trait>(relation: Relation<T>) => Entity | undefined;
	targetsFor: <T extends Trait>(relation: Relation<T>) => Entity[];
	id: () => number;
	generation: () => number;
	isAlive: () => boolean;
};
