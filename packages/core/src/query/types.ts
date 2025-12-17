import { Brand } from '../common';
import type { Entity } from '../entity/types';
import type { RelationPair } from '../relation/types';
import { AoSFactory, Store } from '../storage';
import type {
	ExtractSchema,
	ExtractStore,
	IsTag,
	Trait,
	TraitInstance,
	TraitRecord,
} from '../trait/types';
import type { SparseSet } from '../utils/sparse-set';
import type { World } from '../world';
import { $modifier } from './modifier';

export type QueryModifier = (...components: Trait[]) => ModifierData;
export type QueryParameter = Trait | RelationPair | ReturnType<QueryModifier>;
export type QuerySubscriber = (entity: Entity) => void;
export type QueryUnsubscriber = () => void;

export type QueryResultOptions = {
	changeDetection?: 'always' | 'auto' | 'never';
};

export type QueryResult<T extends QueryParameter[] = QueryParameter[]> = readonly Entity[] & {
	updateEach: (
		callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
		options?: QueryResultOptions
	) => QueryResult<T>;
	useStores: (
		callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
	) => QueryResult<T>;
	select<U extends QueryParameter[]>(...params: U): QueryResult<U>;
	sort(callback?: (a: Entity, b: Entity) => number): QueryResult<T>;
};

type UnwrapModifierData<T> = T extends ModifierData<infer C> ? C : never;

export type StoresFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest]
	? [
			...(First extends Trait
				? [ExtractStore<First>]
				: First extends ModifierData
				? StoresFromParameters<UnwrapModifierData<First>>
				: []),
			...(Rest extends QueryParameter[] ? StoresFromParameters<Rest> : [])
	  ]
	: [];

export type InstancesFromParameters<T extends QueryParameter[]> = T extends [
	infer First,
	...infer Rest
]
	? [
			...(First extends Trait
				? IsTag<First> extends false
					? ExtractSchema<First> extends AoSFactory
						? [ReturnType<ExtractSchema<First>>]
						: [TraitRecord<First>]
					: []
				: First extends ModifierData
				? IsNotModifier<First> extends true
					? []
					: InstancesFromParameters<UnwrapModifierData<First>>
				: []),
			...(Rest extends QueryParameter[] ? InstancesFromParameters<Rest> : [])
	  ]
	: [];

export type IsNotModifier<T> = T extends ModifierData<Trait[], infer TType>
	? TType extends 'not'
		? true
		: false
	: false;

const $parameters = Symbol();
export const $queryRef = Symbol('queryRef');

export type QueryRef<T extends QueryParameter[]> = {
	readonly [$queryRef]: true;
	/** Public read-only ID for fast array lookups */
	readonly id: number;
	/** Hash string for deduplication */
	readonly hash: string;
	/** Query parameters for creating instances */
	readonly parameters: T;
	readonly [$parameters]: T;
};

/**
 * Check if a value is a QueryRef
 */
export /* @inline @pure */ function isQueryRef(value: unknown): value is QueryRef<any> {
	return (value as Brand<typeof $queryRef> | null | undefined)?.[$queryRef] as unknown as boolean;
}

export type ModifierData<TTrait extends Trait[] = Trait[], TType extends string = string> = {
	[$modifier]: true;
	type: TType;
	id: number;
	traits: TTrait;
	traitIds: number[];
};

export type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = {
	version: number;
	world: World;
	parameters: T;
	hash: string;
	traits: Trait[];
	resultStores: Store[];
	resultTraits: Trait[];
	traitData: {
		required: TraitInstance[];
		forbidden: TraitInstance[];
		or: TraitInstance[];
		added: TraitInstance[];
		removed: TraitInstance[];
		changed: TraitInstance[];
		all: TraitInstance[];
	};
	bitmasks: {
		required: number;
		forbidden: number;
		or: number;
		added: number;
		removed: number;
		changed: number;
		addedTracker: number[];
		removedTracker: number[];
		changedTracker: number[];
	}[];
	generations: number[];
	entities: SparseSet;
	isTracking: boolean;
	hasChangedModifiers: boolean;
	changedTraits: Set<Trait>;
	toRemove: SparseSet;
	addSubscriptions: Set<QuerySubscriber>;
	removeSubscriptions: Set<QuerySubscriber>;
	/** Relation pairs for target-specific queries */
	relationFilters?: RelationPair[];
	run: (world: World) => QueryResult<T>;
	add: (entity: Entity) => void;
	remove: (world: World, entity: Entity) => void;
	check: (world: World, entity: Entity) => boolean;
	checkTracking: (
		world: World,
		entity: Entity,
		eventType: 'add' | 'remove' | 'change',
		generationId: number,
		bitflag: number
	) => boolean;
	resetTrackingBitmasks: (eid: number) => void;
};

export type EventType = 'add' | 'remove' | 'change';

/** @deprecated Use QueryInstance instead */
export type Query<T extends QueryParameter[] = QueryParameter[]> = QueryInstance<T>;

/** @deprecated Use QueryRef instead */
export type QueryHash<T extends QueryParameter[]> = QueryRef<T>;
