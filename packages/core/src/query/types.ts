import type { EntityComparator, EntityView, OrderedView } from '../view/types';
import type { SparseSet } from '@koota/collections';
import type { Entity } from '../entity/types';
import type { Identifier, IdentifierPair } from '../identifier/types';
import type { RelationPair } from '../relation/types';
import { AoSFactory, type Store } from '../storage';
import type { QueryIterators } from './utils/compile-iterators';
import type {
  ExtractSchema,
  ExtractStore,
  IsTag,
  Trait,
  TraitInput,
  TraitInstance,
  TraitRecord,
} from '../trait/types';
import type { WorldContext } from '../world';
import { $modifier } from './modifier';
import { $parameters, $queryRef } from './symbols';

export type QueryModifier = (...components: Trait[]) => Modifier;
export type QueryParameter =
  Trait | RelationPair | Identifier | IdentifierPair | ReturnType<QueryModifier>;
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
  /** Iterators compiled for this binding alone, so its callback site stays monomorphic. */
  iterators: QueryIterators | null;
};

export type QueryIterationBuffers = {
  state: any[];
  /** Traits the records and iterators were prepared for. */
  traits: Trait[];
  /** SoA records with their owned tuple arrays, or a cursor set, undefined for other traits. */
  records: (
    | {
        value: any;
        tuples: Record<string, unknown[]> | undefined;
        plain?: object;
        reader?: object;
      }
    | undefined
  )[];
  iterators: QueryIterators | undefined;
  /** Removed walks can read dead entities until their retained history is evicted. */
  retains: boolean;
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
export interface QueryView<T extends QueryParameter[] = QueryParameter[]> extends EntityView<T> {
  /** Zero-copy array. Do not mutate it. Finish reading before another query run or membership change. */
  readonly entities: readonly Entity[];
  getPages(): readonly QueryPage<T>[];
  select<U extends QueryParameter[]>(...params: U): QueryView<U>;
  /** Caches a derived order. Omit deps or pass [] to sort on every access. */
  sort(compare: EntityComparator, deps?: readonly Trait[]): OrderedView<T>;
}

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
  /**
   * How the pair counts toward a match: 1 required, 2 forbidden, 3 one of the or terms. A pair
   * with term 4 belongs to a tracking modifier, which matches on its events instead.
   */
  term: 1 | 2 | 3 | 4;
  targetQueryRef: Query<QueryParameter[]> | undefined;
  targetQueryMatches: SparseSet | undefined;
};

export type Modifier<TTrait extends Trait[] = Trait[], TType extends string = string> = {
  [$modifier]: true;
  type: TType;
  id: number;
  traits: TTrait;
  traitIds: number[];
  /** Pairs with a specific target or target query. */
  pairs: RelationPair[] | null;
  /** Tracking modifiers nested in an Or modifier. */
  modifiers: Modifier[] | null;
};

/** Parameter types that can be passed to Or modifier */
export type OrParameter = TraitInput | RelationPair | Modifier;

/** Or modifier that can contain both traits and nested modifiers */
export type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<
  ExtractTraitsFromOrParams<T>,
  'or'
>;

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
  type: EventType;
  /** Tracking modifier ID for snapshot/mask lookups */
  id: number;
  /** Bitmasks indexed by generationId */
  bitmasks: (number | undefined)[];
  /** Per-entity tracker state indexed by [generationId][pageId][offset] */
  trackers: Uint32Array[][];
  /** The group tracks one trait, so a hit on it satisfies the group. */
  single: boolean;
  /**
   * A group tracks trait bits or relation pairs, never both. A pair group lists its pairs here
   * and gives each one bit by position, kept under generation 0 of bitmasks and trackers. Code
   * that reads bitmasks as trait bits skips pair groups.
   */
  pairs: ResolvedRelationFilter[] | null;
};

export type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = {
  version: number;
  ctx: WorldContext;
  parameters: T;
  /** Every identifier term must resolve to the candidate entity. */
  identifierFilters: IdentifierPair[] | undefined;
  hash: QueryHash;
  refId: number;
  traits: Trait[];
  /** Every trait instance the query joins, tracked first, then required, forbidden and or. */
  traitInstances: TraitInstance[];
  /** Four entries per mask generation the query reads: generation id, required, forbidden and or bits. */
  masks: number[];
  /** Unified tracking groups with explicit AND/OR logic */
  trackingGroups: TrackingGroup[];
  /** Entities matching the query. A tracking query accumulates its next batch here. */
  entities: SparseSet;
  /** The set results read. Aliases entities for plain queries, swaps with it for tracking ones. */
  exposed: SparseSet;
  /** Walks in progress over the results. Removals stay pending while it is nonzero. */
  iterating: number;
  isTracking: boolean;
  /**
   * Holds a Removed term. Its other terms read the traits a dead entity died with, and its
   * pending and exposed batches are trimmed when the retention cap evicts an entity.
   */
  retains: boolean;
  /**
   * Or trait bits in the layout of masks. They are kept here instead when the or term also holds
   * relation pairs, since a pair can satisfy the term without any of the bits. Null otherwise.
   */
  orMasks: number[] | null;
  /** Changed terms indexed by mask generation, for direct write dispatch. */
  changedMasks: number[];
  /** Removals deferred by a walk in progress, created on the first one. */
  toRemove: SparseSet | null;
  /** Position in the world's list of queries that spawn and destroy visit, or -1 when not listed. */
  notIndex: number;
  /** An active dispatch may still hold a list containing a dropped query. */
  dropped: boolean;
  /** Position in each trait list the query joined, trait lists first, then one per relation filter. */
  listSlots: number[];
  cleanup: QueryUnsubscriber[] | null;
  addSubscriptions: Set<QuerySubscriber> | null;
  removeSubscriptions: Set<QuerySubscriber> | null;
  layoutCache: QueryLayoutCache | null;
  iterationBuffers: QueryIterationBuffers | undefined;
  viewBindings: QueryViewBinding[];
  /** Relation pairs for target-specific queries, required, forbidden or part of the or term. */
  relationFilters: ResolvedRelationFilter[];
};

export type EventType = 'add' | 'remove' | 'change';
