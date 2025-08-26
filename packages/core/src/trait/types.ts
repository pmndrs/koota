import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Query } from '../query/types';
import type { Relation, RelationTarget } from '../relation/types';
import type { IsEmpty } from '../utils/types';

export type TraitType = 'aos' | 'soa';

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
	? ReturnType<TSchema>
	: Partial<TraitRecord<TSchema>>;

export type Trait<TSchema extends Schema = any> = {
	schema: TSchema;
	[$internal]: {
		set: (index: number, store: any, value: TraitValue<TSchema>) => void;
		fastSet: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
		fastSetWithChangeDetection: (
			index: number,
			store: any,
			value: TraitValue<TSchema>
		) => boolean;
		get: (index: number, store: any) => TraitRecord<TSchema>;
		stores: Store<TSchema>[];
		id: number;
		createStore: () => Store<TSchema>;
		isPairTrait: boolean;
		relation: Relation<any> | null;
		pairTarget: RelationTarget | null;
		isTag: IsEmpty<TSchema>;
		type: TraitType;
	};
} & ((params?: TraitValue<TSchema>) => [Trait<TSchema>, TraitValue<TSchema>]);

export type TagTrait = Trait<Record<string, never>>;

export type TraitTuple<T extends Trait = Trait> = [
	T,
	T extends Trait<infer S>
		? S extends AoSFactory
			? ReturnType<S>
			: Partial<TraitRecord<S>>
		: never
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T>;

export type SetTraitCallback<T extends Trait> = (
	prev: TraitRecord<ExtractSchema<T>>
) => TraitValue<ExtractSchema<T>>;

type TraitRecordFromSchema<T extends Schema> = T extends AoSFactory
	? ReturnType<T>
	: {
			[P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]> : T[P];
	  };

/**
 * The record of a trait.
 * For SoA it is a snapshot of the state for a single entity.
 * For AoS it is the state instance for a single entity.
 */
export type TraitRecord<T extends Trait | Schema> = T extends Trait
	? TraitRecordFromSchema<T['schema']>
	: TraitRecordFromSchema<T>;

export type Schema =
	| {
			[key: string]: number | bigint | string | boolean | null | undefined | (() => unknown);
	  }
	| AoSFactory
	| Record<string, never>;

export type AoSFactory = () => unknown;

export type Store<T extends Schema = any> = T extends AoSFactory
	? ReturnType<T>[]
	: {
			[P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]>[] : T[P][];
	  };

// Type Utils

// This type utility ensures that explicit values like true, false or "string literal" are
// normalized to their primitive types. Mostly used for schema types.
export type Norm<T extends Schema> = T extends Record<string, never>
	? T
	: T extends AoSFactory
	? () => ReturnType<T> extends number
			? number
			: ReturnType<T> extends boolean
			? boolean
			: ReturnType<T> extends string
			? string
			: ReturnType<T>
	: {
			[K in keyof T]: T[K] extends object
				? T[K] extends (...args: never[]) => unknown
					? T[K]
					: never
				: T[K] extends boolean
				? boolean
				: T[K];
	  }[keyof T] extends never
	? never
	: {
			[K in keyof T]: T[K] extends boolean ? boolean : T[K];
	  };

export type ExtractSchema<T extends Trait | Relation<Trait>> = T extends Relation<infer R>
	? ExtractSchema<R>
	: T extends Trait<infer S>
	? S
	: never;
export type ExtractStore<T extends Trait> = T extends { [$internal]: { createStore(): infer Store } }
	? Store
	: never;
export type ExtractIsTag<T extends Trait> = T extends { [$internal]: { isTag: true } } ? true : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;

export interface TraitData<T extends Trait = Trait, S extends Schema = ExtractSchema<T>> {
	generationId: number;
	bitflag: number;
	trait: Trait;
	store: Store<S>;
	queries: Set<Query>;
	notQueries: Set<Query>;
	schema: S;
	changeSubscriptions: Set<(entity: Entity) => void>;
	addSubscriptions: Set<(entity: Entity) => void>;
	removeSubscriptions: Set<(entity: Entity) => void>;
}
