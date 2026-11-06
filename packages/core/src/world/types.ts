import { ActionInstance } from '../actions/types';
import type { $internal } from '../common';
import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import type { Entity } from '../entity/types';
import type { createEntityIndex } from '../entity/utils/entity-index';
import type {
  Query,
  QueryInstance,
  QueryIterationBuffers,
  QueryParameter,
  QueryView,
  QueryUnsubscriber,
} from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitInstance,
  TraitOut,
  TraitRecord,
  TraitValue,
} from '../trait/types';

/**
 * A step in the tree of resolved inline parameter lists. The list ending here holds its query. A
 * pair naming a target entity takes two steps, its relation and then its target.
 */
export type InlineQueryNode = {
  next: Map<QueryParameter | Relation<Trait> | Entity, InlineQueryNode> | null;
  params: QueryParameter[] | null;
  query: QueryInstance | null;
  /** Pruning stops at the stable prefix before the first concrete target. */
  parent: InlineQueryNode | null;
  key: QueryParameter | Relation<Trait> | Entity | null;
};

export type WorldContext = {
  entityIndex: ReturnType<typeof createEntityIndex>;
  /**
   * Membership and removal history by mask generation and page. See paged-mask.
   */
  entityMasks: Uint32Array[][];
  bitflag: number;
  traitInstances: (TraitInstance | undefined)[];
  /** Trait instances by mask generation and bit index, so a mask word can be walked back to its traits. */
  traitsByBit: TraitInstance[][];
  traits: Set<Trait>;
  relations: Relation<Trait>[];
  queriesHashMap: Map<string, QueryInstance>;
  /** Inline parameter lists already resolved, as a tree with one level per parameter. */
  inlineQueries: InlineQueryNode;
  queryInstances: (QueryInstance | undefined)[];
  iterationBuffers: QueryIterationBuffers | undefined;
  actionInstances: (ActionInstance | undefined)[];
  /** Tracking queries, and static queries that an entity holding no traits satisfies. */
  notQueries: QueryInstance[];
  queryCallbackDepth: number;
  /** Some entity may hold a pending bit, so membership changes clear the pending word. */
  defersChanges: boolean;
  /** Queries indexed by target entity page and offset. */
  targetQueries: (QueryInstance[] | undefined)[][];
  /** Queries holding removals deferred by a walk, each listed once. */
  dirtyQueries: QueryInstance[];
  /** Maximum destroyed entities whose data and query history remain readable. */
  readonly retain: number;
  /** Retained destroyed entities in destroy order. Overflow evicts the oldest. */
  tombstones: { ids: Entity[]; head: number };
  /**
   * Pairs that live entities lost, newest retain entries, as entity, relation trait id, target and
   * the release count at the time. A Removed query created later seeds its pair terms from them.
   */
  pairRemovals: { entries: number[]; head: number };
  worldEntity: Entity;
  entitySubscribedInstances: Set<TraitInstance>;
  resetSubscriptions: Set<() => void>;
  entitySpawnSubscriptions: Set<(entity: Entity) => void>;
  entityDestroySubscriptions: Set<(entity: Entity) => void>;
  traitRegisteredSubscriptions: Set<(trait: Trait) => void>;
  isRegistered: boolean;
  cleanupToken: import('../entity/utils/page-allocator').PageCleanupToken | null;
  structuralRevision: number;
};

export type WorldOptions = {
  /**
   * Maximum retained destroyed entities. Defaults to 1024. Overflow evicts the oldest even if
   * a Removed reader has not consumed it. Zero disables destroyed-entity retention.
   * Must be a non-negative safe integer.
   */
  retain?: number;
};

export type World = {
  /** The retention cap set at creation. Read-only and preserved by reset. */
  readonly retain: number;
  readonly id: number;
  readonly isRegistered: boolean;
  readonly entities: Entity[];
  readonly traits: Set<Trait>;
  [$internal]: WorldContext;
  spawn(...traits: ConfigurableTrait[]): Entity;
  /** Resolve one current owner, including excluded entities, or undefined if absent. */
  lookup<K extends IdentifierKey>(pair: IdentifierPair<K>): Entity | undefined;
  /** Return a snapshot of every current owner, including excluded entities. */
  lookupAll<K extends IdentifierKey>(pair: IdentifierPair<K>): Entity[];
  has(entity: Entity): boolean;
  has(trait: Trait | Identifier | IdentifierPair): boolean;
  has(target: Entity | Trait | Identifier | IdentifierPair): boolean;
  add(...traits: ConfigurableTrait[]): void;
  remove(...traits: (Trait | Identifier | IdentifierPair)[]): void;
  get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
  get<T extends Trait, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
  destroy(): void;
  reset(): void;
  query<T extends QueryParameter[]>(key: Query<T>): QueryView<T>;
  query<T extends QueryParameter[]>(...parameters: T): QueryView<T>;
  queryFirst<T extends QueryParameter[]>(key: Query<T>): Entity | undefined;
  queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
  onQueryAdd<T extends QueryParameter[]>(
    key: Query<T>,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  onQueryAdd<T extends QueryParameter[]>(
    parameters: T,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  onQueryRemove<T extends QueryParameter[]>(
    key: Query<T>,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  onQueryRemove<T extends QueryParameter[]>(
    parameters: T,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  onAdd<K extends IdentifierKey>(
    input: Identifier<K> | IdentifierPair<K>,
    callback: (entity: Entity, key: K) => void
  ): QueryUnsubscriber;
  onAdd<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
  onAdd<T extends Trait>(
    relation: Relation<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onAdd<T extends Trait>(
    pair: RelationPair<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onAdd(
    input: Trait | Relation<Trait> | RelationPair,
    callback: (entity: Entity, target?: Entity) => void
  ): QueryUnsubscriber;
  onRemove<K extends IdentifierKey>(
    input: Identifier<K> | IdentifierPair<K>,
    callback: (entity: Entity, key: K) => void
  ): QueryUnsubscriber;
  onRemove<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
  onRemove<T extends Trait>(
    relation: Relation<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onRemove<T extends Trait>(
    pair: RelationPair<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onRemove(
    input: Trait | Relation<Trait> | RelationPair,
    callback: (entity: Entity, target?: Entity) => void
  ): QueryUnsubscriber;
  onChange<K extends IdentifierKey>(
    input: Identifier<K> | IdentifierPair<K>,
    callback: (entity: Entity, key: K) => void
  ): QueryUnsubscriber;
  /** Reports future additions and writes. Removals use onRemove. */
  onChange<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
  onChange<T extends Trait>(
    relation: Relation<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onChange<T extends Trait>(
    pair: RelationPair<T>,
    callback: (entity: Entity, target: Entity) => void
  ): QueryUnsubscriber;
  onChange(
    input: Trait | Relation<Trait> | RelationPair,
    callback: (entity: Entity, target?: Entity) => void
  ): QueryUnsubscriber;
  onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber;
  onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber;
  onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber;
};
