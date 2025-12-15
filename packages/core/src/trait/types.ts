import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Query } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type { AoSFactory, Schema, Store, StoreType } from '../storage';
import type { IsEmpty } from '../utils/types';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

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
		id: number;
		createStore: () => Store<TSchema>;
		/** Reference to parent relation if this trait is owned by a relation */
		relation: Relation<any> | null;
		isTag: IsEmpty<TSchema>;
		type: StoreType;
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

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;

export type SetTraitCallback<T extends Trait | RelationPair> = (
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

// Type Utils

export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> = T extends RelationPair<
	infer R
>
	? ExtractSchema<R>
	: T extends Relation<infer R>
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
	/** Non-tracking queries that include this trait */
	queries: Set<Query>;
	/** Tracking queries (Added/Removed/Changed) that include this trait */
	trackingQueries: Set<Query>;
	notQueries: Set<Query>;
	/** Queries that filter by this relation (only for relation traits) */
	relationQueries: Set<Query>;
	schema: S;
	changeSubscriptions: Set<(entity: Entity) => void>;
	addSubscriptions: Set<(entity: Entity) => void>;
	removeSubscriptions: Set<(entity: Entity) => void>;
	/**
	 * Only for relation traits.
	 * For exclusive: relationTargets[eid] = targetId (number)
	 * For non-exclusive: relationTargets[eid] = [targetId1, targetId2, ...] (number[])
	 */
	relationTargets?: number[] | number[][];
}

export type TraitOrRelation = Trait | Relation<Trait>;
