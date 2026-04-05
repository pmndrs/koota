import type { Entity } from '../entity/types';
import type { PairPattern } from '../trait/types';
import type { ExtractStore, ExtractType, IsTag, Trait, TraitInstance } from '../trait/types';
import type { SparseSet, HiSparseBitSet } from '@koota/collections';
import type { World } from '../world';
import { $modifier } from './modifier';
import { $parameters, $queryRef } from './symbols';

export type QueryModifier = (...components: Trait[]) => Modifier;
export type QueryParameter = Trait | PairPattern | ReturnType<QueryModifier>;
export type QuerySubscriber = (entity: Entity) => void;
export type QueryUnsubscriber = () => void;

export type QueryResultOptions = {
    changeDetection?: 'always' | 'auto' | 'never';
};

export type QueryResult<T extends QueryParameter[] = QueryParameter[]> = readonly Entity[] & {
    readEach: (
        callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
    ) => QueryResult<T>;
    updateEach: (
        callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
        options?: QueryResultOptions
    ) => QueryResult<T>;
    useStores: (
        callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
    ) => QueryResult<T>;
    forEachBlock: (
        callback: (stores: StoresFromParameters<T>, offsets: Uint16Array, count: number) => void
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
                  ? [ExtractType<First>]
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
    /** numeric id for fast array lookups */
    readonly id: number;
    /** hash string used to deduplicate identical queries */
    readonly hash: QueryHash;
    /** the parameters this query was created with */
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

/** parameter types accepted by the Or modifier */
export type OrParameter = Trait | Modifier;

/** or modifier that can wrap both traits and nested modifiers */
export type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<
    ExtractTraitsFromOrParams<T>,
    'or'
> & {
    modifiers: Modifier[];
};

/** pulls out just the trait types from a mixed list of or parameters */
type ExtractTraitsFromOrParams<T extends OrParameter[]> = T extends [infer First, ...infer Rest]
    ? First extends Trait
        ? Rest extends OrParameter[]
            ? [First, ...ExtractTraitsFromOrParams<Rest>]
            : [First]
        : Rest extends OrParameter[]
          ? ExtractTraitsFromOrParams<Rest>
          : []
    : [];

/**
 * a group that tracks add/remove/change events across one or more traits,
 * supporting both AND and OR logic for when the event should fire.
 */
export type TrackingGroup = {
    logic: 'and' | 'or';
    type: 'add' | 'remove' | 'change';
    id: number;
    groupTraitInstances: TraitInstance[];
    trackerBitSets: HiSparseBitSet[];
};

export type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = {
    version: number;
    world: World;
    parameters: T;
    hash: QueryHash;
    traits: Trait[];
    /** trait instances used for matching (not for tracking) */
    traitInstances: {
        required: TraitInstance[];
        forbidden: TraitInstance[];
        or: TraitInstance[];
        all: TraitInstance[];
    };
    /** tracking groups that define how add/remove/change events are detected */
    trackingGroups: TrackingGroup[];
    entities: SparseSet;
    isTracking: boolean;
    hasChangedModifiers: boolean;
    changedTraits: Set<Trait>;
    toRemove: SparseSet;
    addSubscriptions: Set<QuerySubscriber>;
    removeSubscriptions: Set<QuerySubscriber>;
    /** relation pairs used to filter by specific targets */
    relationFilters?: PairPattern[];
    run: (world: World, params: QueryParameter[]) => QueryResult<T>;
    add: (entity: Entity) => void;
    remove: (world: World, entity: Entity) => void;
    check: (world: World, entity: Entity) => boolean;
    checkTracking: (
        world: World,
        entity: Entity,
        eventType: 'add' | 'remove' | 'change',
        trait: Trait
    ) => boolean;
    resetTrackingBitmasks: (eid: number) => void;
};

export type EventType = 'add' | 'remove' | 'change';
