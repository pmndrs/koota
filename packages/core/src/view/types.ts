import type { Entity } from '../entity/types';
import type { InstancesFromParameters, QueryParameter, UpdateEachOptions } from '../query/types';

export type EntityComparator = (a: Entity, b: Entity) => number;

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
  each(callback: (...args: [...InstancesFromParameters<T>, Entity, number]) => void): this;
  /** @deprecated Use each. Reads cost the same and writes are dropped. */
  readEach(
    callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
  ): this;
  /** @deprecated Use each. */
  updateEach(
    callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
    options?: UpdateEachOptions
  ): this;
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

/** Explicit ordering and membership edits, used by ordered relation traits. */
export interface MutableOrderedView<T extends QueryParameter[] = []> extends EntityView<T> {
  has(entity: Entity): boolean;
  indexOf(entity: Entity): number;
  add(entity: Entity): this;
  insert(entity: Entity, index: number): this;
  remove(entity: Entity): boolean;
  clear(): void;
  moveTo(entity: Entity, index: number): this;
  /** Sorts this sequence once, in place. */
  sort(compare: EntityComparator): this;
  reverse(): this;
}
