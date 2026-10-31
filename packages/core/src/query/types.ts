import type { SparseSet } from '@koota/collections';
import type { Entity } from '../entity/types';
import type { NameConfig } from '../name/types';
import type { RelationPair } from '../relation/types';
import { AoSFactory, type Store } from '../storage';
import type { QueryIterators } from './utils/compile-iterators';
import type {
  ExtractSchema,
  ExtractStore,
  IsTag,
  Trait,
  TraitOrRelation,
  TraitInstance,
  TraitRecord,
} from '../trait/types';
import type { WorldContext } from '../world';
import { $modifier } from './modifier';
import { $parameters, $queryRef } from './symbols';

export type QueryModifier = (...components: Trait[]) => Modifier;
export type QueryParameter = Trait | RelationPair | NameConfig | ReturnType<QueryModifier>;
export type QuerySubscriber = (entity: Entity) => void;
export type QueryUnsubscriber = () => void;

export type UpdateEachOptions = {
  changeDetection?: 'always' | 'auto' | 'never';
};

export type QueryViewBinding = {
  params: QueryParameter[];
  traits: Trait[];
  stores: Store<any>[];
  /** Live view over the query for these traits, created on first use. */
  view: QueryView<any> | null;
};

export type QueryIterationBuffers = {
  state: any[];
  /** Traits the records and iterators were prepared for. */
  traits: Trait[];
  /** SoA records with their owned tuple arrays, undefined for other traits. */
  records: ({ value: any; tuples: Record<string, unknown[]> | undefined } | undefined)[];
  iterators: QueryIterators | undefined;
  /** Change detection per trait: 0 untracked, 1 tracked, 2 tracked atomic, 3 always. */
  modes: number[];
  atomicSnapshots: { keys: string[]; values: any[]; count: number }[];
  changedEntities: Entity[];
  changedTraits: Trait[];
  next: QueryIterationBuffers | undefined;
};

export type QueryLayout = {
  pageCount: number;
  pageIds: Uint32Array;
  pageStarts: Uint32Array;
  pageCounts: Uint16Array;
  offsets: Uint16Array;
  entities: readonly Entity[];
};

export type QueryLayoutCache = QueryLayout & { version: number };

export type QueryPage<T extends QueryParameter[] = QueryParameter[]> = {
  readonly index: number;
  readonly stores: PageStoresFromParameters<T>;
  readonly indices: Uint16Array;
  readonly entities: readonly Entity[];
};

/**
 * Live view over the entities matching a query. A view returned by a world query reads the query's
 * own entity list, so it reflects later changes and allocates nothing per run. Read it before the
 * next run or structural change, and call toArray for a copy you own.
 */
export type QueryView<T extends QueryParameter[] = QueryParameter[]> = {
  readonly length: number;
  /** The first entity, if any. */
  readonly first: Entity | undefined;
  /** The entity at an index without copying. Negative indices count from the end. */
  at(index: number): Entity | undefined;
  [Symbol.iterator](): IterableIterator<Entity>;
  /** Copies the entities into a plain array. */
  toArray(): Entity[];
  forEach(callback: (entity: Entity, index: number) => void): void;
  readEach(
    callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
  ): QueryView<T>;
  updateEach(
    callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
    options?: UpdateEachOptions
  ): QueryView<T>;
  getPages(): readonly QueryPage<T>[];
  /** A view over the same entities with only the given traits. Cached per trait list. */
  select<U extends QueryParameter[]>(...params: U): QueryView<U>;
};

type UnwrapModifierData<T> = T extends Modifier<infer C> ? C : never;

export type StoresFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest]
  ? [
      ...(First extends Trait
        ? IsTag<First> extends true
          ? []
          : [ExtractStore<First>]
        : First extends Modifier
          ? IsNotModifier<First> extends true
            ? []
            : StoresFromParameters<UnwrapModifierData<First>>
          : []),
      ...(Rest extends QueryParameter[] ? StoresFromParameters<Rest> : []),
    ]
  : [];

type PageStores<T extends unknown[]> = {
  [K in keyof T]: T[K] extends unknown[][]
    ? T[K][number]
    : { [P in keyof T[K]]: T[K][P] extends unknown[] ? T[K][P][number] : never };
};

export type PageStoresFromParameters<T extends QueryParameter[]> = PageStores<
  StoresFromParameters<T>
>;

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

export type ResolvedRelationFilter = RelationPair & {
  targetQueryRef?: Query<QueryParameter[]>;
  targetQueryMatches?: SparseSet;
};

export type Modifier<TTrait extends Trait[] = Trait[], TType extends string = string> = {
  [$modifier]: true;
  type: TType;
  id: number;
  traits: TTrait;
  traitIds: number[];
};

/** Parameter types that can be passed to Or modifier */
export type OrParameter = TraitOrRelation | Modifier;

/** Or modifier that can contain both traits and nested modifiers */
export type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<
  ExtractTraitsFromOrParams<T>,
  'or'
> & {
  modifiers: Modifier[];
};

/** Extract traits from Or parameters (filters out modifiers) */
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
 * Unified tracking group that supports both AND and OR logic.
 * Replaces the old separate tracking arrays and OrTrackingGroup.
 */
export type TrackingGroup = {
  /** Whether all traits must match (and) or any trait can match (or) */
  logic: 'and' | 'or';
  /** The type of tracking event */
  type: 'add' | 'remove' | 'change';
  /** Tracking modifier ID for snapshot/mask lookups */
  id: number;
  /** Bitmasks indexed by generationId */
  bitmasks: (number | undefined)[];
  /** Per-entity tracker state indexed by [generationId][pageId][offset] */
  trackers: Uint32Array[][];
};

export type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = {
  version: number;
  ctx: WorldContext;
  parameters: T;
  /** Undefined for ordinary queries, null for conflicting name filters. */
  name: string | null | undefined;
  hash: QueryHash;
  refId: number;
  traits: Trait[];
  /** Static trait instances for non-tracking query matching */
  traitInstances: {
    required: TraitInstance[];
    forbidden: TraitInstance[];
    or: TraitInstance[];
    all: TraitInstance[];
  };
  /** Static bitmasks for non-tracking query matching (indexed by generationId) */
  staticBitmasks: {
    required: number;
    forbidden: number;
    or: number;
  }[];
  /** Unified tracking groups with explicit AND/OR logic */
  trackingGroups: TrackingGroup[];
  generations: number[];
  /** Entities matching the query. A tracking query accumulates its next batch here. */
  entities: SparseSet;
  /** The batch a tracking query currently exposes. Swapped with entities on each run. */
  batch: SparseSet | undefined;
  /** The set results read. entities for plain queries, the exposed batch for tracking ones. */
  exposed: SparseSet;
  /** Walks in progress over the results. Removals stay pending while it is nonzero. */
  iterating: number;
  isTracking: boolean;
  hasChangedModifiers: boolean;
  changedTraits: Set<Trait>;
  toRemove: SparseSet;
  /** Position in the world's exclusion query list, or -1 when not listed. */
  notIndex: number;
  /** An active dispatch may still hold a list containing a dropped query. */
  dropped: boolean;
  /** Position in each trait list the query joined, trait lists first, then one per relation filter. */
  listSlots: number[];
  cleanup: QueryUnsubscriber[];
  addSubscriptions: Set<QuerySubscriber>;
  removeSubscriptions: Set<QuerySubscriber>;
  layoutCache: QueryLayoutCache | null;
  iterationBuffers: QueryIterationBuffers | undefined;
  viewBindings: QueryViewBinding[];
  /** Relation pairs for target-specific queries */
  relationFilters: ResolvedRelationFilter[];
};

export type EventType = 'add' | 'remove' | 'change';
