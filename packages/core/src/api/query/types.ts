import type { Tracker } from '../../kernel';
import type { Entity } from '../entity/types';
import type { RelationPair } from '../relation/types';
import type { $modifier, $parameters, $queryRef } from '../symbols';
import type {
  AoSFactory,
  ExtractSchema,
  ExtractStore,
  IsTag,
  Trait,
  TraitOrRelation,
  TraitRecord,
} from '../trait/types';

export type QueryModifier = (...traits: Trait[]) => Modifier;
export type QueryParameter = Trait | RelationPair | ReturnType<QueryModifier>;
export type QuerySubscriber = (entity: Entity) => void;
export type QueryUnsubscriber = () => void;

export type QueryResultOptions = {
  changeDetection?: 'always' | 'auto' | 'never';
};

export type QueryPage<T extends QueryParameter[] = QueryParameter[]> = {
  /** Page ordinal in this query result */
  readonly index: number;
  /** Column views for the selected traits, one per data-bearing trait. */
  readonly stores: StoresFromParameters<T>;
  /** Row of each entity inside the page's columns. */
  readonly indices: Uint32Array;
  readonly entities: readonly Entity[];
};

export type QueryResult<T extends QueryParameter[] = QueryParameter[]> = readonly Entity[] & {
  readEach: (callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void) => QueryResult<T>;
  updateEach: (
    callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
    options?: QueryResultOptions
  ) => QueryResult<T>;
  /** Page views with direct access to trait columns, without change detection */
  getPages: () => readonly QueryPage<T>[];
  select<U extends QueryParameter[]>(...params: U): QueryResult<U>;
  sort(callback?: (a: Entity, b: Entity) => number): QueryResult<T>;
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

export type PageStoresFromParameters<T extends QueryParameter[]> = StoresFromParameters<T>;

export type InstancesFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest]
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

export type IsNotModifier<T> = T extends Modifier<Trait[], infer TType> ? (TType extends 'not' ? true : false) : false;

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
  /** Set for Added, Changed, and Removed modifiers. */
  tracker: Tracker | null;
  modifiers: Modifier[] | null;
};

/** Parameter types that can be passed to Or modifier */
export type OrParameter = TraitOrRelation | Modifier;

/** Or modifier that can contain both traits and nested modifiers */
export type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<ExtractTraitsFromOrParams<T>, 'or'> & {
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

export type EventType = 'add' | 'remove' | 'change';
