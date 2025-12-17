import type { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { createEntityIndex } from '../entity/utils/entity-index';
import type {
	QueryInstance,
	QueryRef,
	QueryParameter,
	QueryResult,
	QueryUnsubscriber,
} from '../query/types';
import type { Relation } from '../relation/types';
import type {
	ConfigurableTrait,
	ExtractSchema,
	SetTraitCallback,
	Trait,
	TraitInstance,
	TraitRecord,
	TraitValue,
} from '../trait/types';

export type WorldOptions = {
	traits?: ConfigurableTrait[];
	lazy?: boolean;
};

export type WorldInternal = {
	entityIndex: ReturnType<typeof createEntityIndex>;
	entityMasks: number[][];
	entityTraits: Map<number, Set<Trait>>;
	bitflag: number;
	traitData: (TraitInstance | undefined)[];
	relations: Set<Relation<Trait>>;
	queriesHashMap: Map<string, QueryInstance>;
	queryInstances: (QueryInstance | undefined)[]; // Array indexed by query ref id for fast lookup
	actionInstances: (any | undefined)[]; // Array indexed by actions ref id for fast lookup
	notQueries: Set<QueryInstance>;
	dirtyQueries: Set<QueryInstance>;
	dirtyMasks: Map<number, number[][]>;
	trackingSnapshots: Map<number, number[][]>;
	changedMasks: Map<number, number[][]>;
	worldEntity: Entity;
	trackedTraits: Set<Trait>;
	resetSubscriptions: Set<(world: World) => void>;
};

export type World = {
	readonly id: number;
	readonly isInitialized: boolean;
	readonly entities: Entity[];
	readonly traits: Set<Trait>;
	[$internal]: WorldInternal;
	init(...traits: ConfigurableTrait[]): void;
	spawn(...traits: ConfigurableTrait[]): Entity;
	has(entity: Entity): boolean;
	has(trait: Trait): boolean;
	has(target: Entity | Trait): boolean;
	add(...traits: ConfigurableTrait[]): void;
	remove(...traits: Trait[]): void;
	get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
	set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
	destroy(): void;
	reset(): void;
	query<T extends QueryParameter[]>(key: QueryRef<T>): QueryResult<T>;
	query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
	queryFirst<T extends QueryParameter[]>(key: QueryRef<T>): Entity | undefined;
	queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
	onAdd<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
	onQueryAdd<T extends QueryParameter[]>(
		key: QueryRef<T>,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryAdd<T extends QueryParameter[]>(
		parameters: T,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryRemove<T extends QueryParameter[]>(
		key: QueryRef<T>,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryRemove<T extends QueryParameter[]>(
		parameters: T,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onRemove<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
	onChange(trait: Trait, callback: (entity: Entity) => void): QueryUnsubscriber;
};
