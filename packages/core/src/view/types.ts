import type { SparseSet } from '@koota/collections';
import type { Entity } from '../entity/types';
import type { $internal } from '../internal';
import type {
  IsNotModifier,
  Modifier,
  Query,
  QueryParameter,
  UnwrapModifierData,
} from '../query/types';
import type { Relation, RelationPair, RelationTarget } from '../relation/types';
import type { AoSFactory, CursorSet, Store } from '../storage/types';
import type { ExtractSchema, IsTag, Trait, TraitInstance, TraitRecord } from '../trait/types';
import type { WorldContext } from '../world/types';

// Concrete targets only filter. Discovered targets pass one entity or an array by relation policy.
type RelationInstances<
  Exclusive extends boolean,
  Target extends RelationTarget | undefined,
> = Target extends Entity ? [] : [Exclusive extends true ? Entity : readonly Entity[]];

export type InstancesFromParameters<
  T extends QueryParameter[],
  Targets extends boolean = true,
> = T extends [infer First, ...infer Rest]
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
            : InstancesFromParameters<UnwrapModifierData<First>, false>
          : Targets extends true
            ? First extends RelationPair
              ? RelationInstances<First['relation'][typeof $internal]['exclusive'], First['target']>
              : []
            : []),
      ...(Rest extends QueryParameter[] ? InstancesFromParameters<Rest, Targets> : []),
    ]
  : [];

export type EntityComparator = (a: Entity, b: Entity) => number;
/** Returns a number other than NaN. Do not mutate or retain the borrowed value or change the world. */
export type SortKeySelector<T extends Trait = Trait> = (value: Readonly<TraitRecord<T>>) => number;

/** An entity sequence with borrowed access to its trait data. */
export interface EntityView<T extends QueryParameter[] = QueryParameter[]> {
  readonly length: number;
  readonly first: Entity | undefined;
  at(index: number): Entity | undefined;
  [Symbol.iterator](): IterableIterator<Entity>;
  toArray(): Entity[];
  forEach(callback: (entity: Entity, index: number) => void): void;
  /** Returns a new array of callback results in view order. */
  map<U>(callback: (entity: Entity, index: number) => U): U[];
  /**
   * Relation target arrays are read only and hold until the callback returns. A wildcard pair
   * passes the relation's own list, so writing to it corrupts the relation.
   */
  each(callback: (...args: [...InstancesFromParameters<T>, Entity, number]) => void): this;
  /** Selects accessors without filtering. Every entity must carry the selected traits. */
  select<U extends QueryParameter[]>(...params: U): EntityView<U>;
}

/** A query's derived order, shared by its selections. */
export interface OrderedView<T extends QueryParameter[] = QueryParameter[]> extends EntityView<T> {
  /** Borrowed read-only array. Refreshes on access unless a view walk is active. */
  readonly entities: readonly Entity[];
  select<U extends QueryParameter[]>(...params: U): OrderedView<U>;
  /** Refresh on the next access after active walks finish, including external comparator state. */
  invalidate(): void;
}

/** Explicit edits apply in call order when the outermost defer scope ends. */
export interface MutableOrderedView<T extends QueryParameter[] = []> extends EntityView<T> {
  has(entity: Entity): boolean;
  indexOf(entity: Entity): number;
  add(entity: Entity): this;
  insert(entity: Entity, index: number): this;
  remove(entity: Entity): boolean;
  clear(): void;
  moveTo(entity: Entity, index: number): this;
  sort(compare: EntityComparator): this;
  reverse(): this;
}

/** Resolves selected parameters to the stores and relation targets a view reads, in callback order. */
export type ViewBinding = {
  /** Reusable buffers for simultaneous walks of this binding. */
  iterationBuffers: IterationBuffers | undefined;
  params: QueryParameter[];
  traits: Trait[];
  /** The world's instance of each trait, parallel to traits. */
  instances: TraitInstance[];
  stores: Store<any>[];
  /** Data traits and target projections in each's callback argument order. */
  projection: (Trait | TargetProjection)[];
  /** Per projection position, the target query match set a pair reads, else undefined. */
  targets: (SparseSet | undefined)[];
  /** The live view a supplier keeps for this selection, created on first use. */
  view: { source: EntitySource } | null;
  /**
   * The iterators its walks run. A cached binding compiles its own on first use, so its callback
   * site stays monomorphic. Any other shares the set for its projection.
   */
  iterators: ViewIterators | null;
  /** The world tracking revision at which no trait here had a change observer, else -1. */
  untracked: number;
};

/**
 * How a required pair reaches the callback. Entries are interned per instance and mode so
 * bindings and iterator caches can compare them by identity. Slot passes what the relation
 * stores for the entity, the one target of an exclusive relation or the live target list of any
 * other. Filter snapshots the targets inside the pair's target query match set.
 */
export type TargetProjection = {
  instance: TraitInstance;
  mode: 'slot' | 'filter';
};

/** A filter a supplier applies to the targets of a pair, with the set of targets that pass it. */
export type TargetFilter = {
  relation: Relation<any>;
  targetQuery?: Query<QueryParameter[]> | readonly QueryParameter[];
  resolvedTargetQuery: Query<QueryParameter[]> | undefined;
  targetQueryMatches: SparseSet | undefined;
};

/**
 * What a supplier of entities offers beyond the sequence. Selections resolve against it, and a
 * derived order reads its version to tell when the sequence changed. A query is one. A list that
 * an ordered relation keeps has none.
 */
export type ViewScope = {
  /** Selections already resolved, so the same one is bound once. */
  viewBindings: ViewBinding[];
  filters: { pairs: readonly TargetFilter[] } | null;
  version: number;
};

/** The live prefix of an entity sequence. Storage stays indexed by entity id. */
export type EntitySource = {
  readonly dense: readonly number[];
  readonly length: number;
};

/**
 * Counts the callback walks and open for...of iterators reading a sequence, so whatever supplies
 * the sequence keeps their array stable until they finish.
 */
export type WalkGuard = {
  iterating: number;
  readers: number;
};

export type Callback = (...args: any[]) => void;

/** Walks the membership present when the loop started. */
export interface ViewIterator extends IterableIterator<Entity> {
  index: number;
  readonly length: number;
  readonly dense: readonly number[];
  readonly source: EntitySource;
  readonly guard: { readers: number } | null;
  readonly result: { value: Entity; done: boolean };
}

export type Iterate<R = void> = (
  ctx: WorldContext,
  entities: readonly Entity[],
  length: number,
  callback: Callback,
  buffers: IterationBuffers,
  stores: Store<any>[]
) => R;

export type ViewIterators = {
  /** Flushes borrowed tuples after each callback. */
  each: Iterate;
  /** Also records changes to observed traits and returns the number of changes. */
  track: Iterate<number>;
};

export type IteratorCache = {
  keys: WeakMap<Trait | TargetProjection, IteratorCache>;
  iterators: ViewIterators | undefined;
};

export type IterationBuffers = {
  /** Projection the records and iterators were prepared for. */
  binding: ViewBinding | undefined;
  /** The cursors of each SoA trait by kind, undefined for other traits. */
  cursors: (CursorSet | undefined)[];
  /** Reusable filtered target arrays for this active walk, indexed by projection position. */
  targetSnapshots: Entity[][];
  iterators: ViewIterators | undefined;
  /** Whether each data trait has a change observer for this walk. */
  tracked: boolean[];
  atomicSnapshots: { keys: string[]; values: any[]; count: number }[];
  changedEntities: Entity[];
  changedTraits: Trait[];
  next: IterationBuffers | undefined;
  /** Where an each walk in progress returns its buffers. Undefined once the walk has ended. */
  pool: IterationBufferPool | undefined;
  /** The sequence guard of an each walk in progress. */
  guard: WalkGuard | null | undefined;
};

export type IterationBufferPool = { iterationBuffers: IterationBuffers | undefined };
