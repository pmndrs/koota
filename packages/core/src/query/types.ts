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
import { $parameters, $queryRef } from './symbols';

export type QueryModifier = (...components: Trait[]) => Modifier;
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

type UnwrapModifierData<T> = T extends Modifier<infer C> ? C : never;

export type StoresFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest]
    ? [
          ...(First extends Trait
              ? [ExtractStore<First>]
              : First extends Modifier
                ? StoresFromParameters<UnwrapModifierData<First>>
                : []),
          ...(Rest extends QueryParameter[] ? StoresFromParameters<Rest> : []),
      ]
    : [];

export type InstancesFromParameters<T extends QueryParameter[]> = T extends [
    infer First,
    ...infer Rest,
]
    ? [
          ...(First extends Trait
              ? IsTag<First> extends false
                  ? ExtractSchema<First> extends AoSFactory
                      ? [ReturnType<ExtractSchema<First>>]
                      : [TraitRecord<First>]
                  : []
              : First extends Modifier
                ? IsNotModifier<First> extends true
                    ? []
                    : InstancesFromParameters<UnwrapModifierData<First>>
                : []),
          ...(Rest extends QueryParameter[] ? InstancesFromParameters<Rest> : []),
      ]
    : [];

export type IsNotModifier<T> =
    T extends Modifier<Trait[], infer TType> ? (TType extends 'not' ? true : false) : false;

export type QueryHash = string;

export type Query<T extends QueryParameter[] = QueryParameter[]> = {
    readonly [$queryRef]: true;
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    /** Hash string for deduplication */
    readonly hash: QueryHash;
    /** Query parameters for creating instances */
    readonly parameters: T;
    readonly [$parameters]: T;
};

export type Modifier<TTrait extends Trait[] = Trait[], TType extends string = string> = {
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
    hash: QueryHash;
    traits: Trait[];
    traitInstances: {
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
    run: (world: World, params: QueryParameter[]) => QueryResult<T>;
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
