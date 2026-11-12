import type { observeSettled } from './settled';
import { ActionInstance } from '../actions/types';
import type { Machine, MachineStates, TransitionSubscriber } from '../machine/types';
import type { QueryNotification, QuerySubscriber } from '../query/types';
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
  TraitInit,
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
  queryBatch: QueryNotification[] | undefined;
  internalQuerySubscriptions:
    WeakMap<QueryInstance, { add: Set<QuerySubscriber>; remove: Set<QuerySubscriber> }> | undefined;
  /** Some entity may hold a pending bit, so membership changes clear the pending word. */
  defersChanges: boolean;
  /** Queries indexed by target entity page and offset. */
  targetQueries: (QueryInstance[] | undefined)[][];
  /** Deferred structural changes as flat entries of command, entity and two arguments. */
  commands: unknown[];
  /** Entries in use. The array keeps its store between flushes and is cleared in bulk. */
  commandCount: number;
  /** Set when a command or a settled observer is queued, so a scope end reads one field. */
  unsettled: boolean;
  /** Pending entities in this world's current destruction cascade. */
  destroyQueue: Entity[];
  /** The entity being destroyed cannot accept new scope children from an immediate spawn. */
  destroying: Entity | undefined;
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
  /** Open defer scopes. Structural changes join the command log while it is nonzero. See defer. */
  deferDepth: number;
  settledQueue: Set<() => void>;
  observeSettled: typeof observeSettled;
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
  /** Resolve a root key or a path of keys from outer scope to local key. */
  lookup(pair: IdentifierPair, ...path: IdentifierPair[]): Entity | undefined;
  lookup(scope: Entity, first: IdentifierPair, ...path: IdentifierPair[]): Entity | undefined;
  /** Resolve the path prefix and return a snapshot of every owner of its final key. */
  lookupAll(pair: IdentifierPair, ...path: IdentifierPair[]): Entity[];
  lookupAll(scope: Entity, first: IdentifierPair, ...path: IdentifierPair[]): Entity[];
  has(entity: Entity): boolean;
  has(trait: Trait | Identifier | IdentifierPair): boolean;
  has(target: Entity | Trait | Identifier | IdentifierPair): boolean;
  add(...traits: ConfigurableTrait[]): void;
  /** Set the value if the world has the trait, or add the trait with the value if it does not. */
  upsert<T extends Trait>(trait: T, value: TraitInit<ExtractSchema<T>>): void;
  remove(...traits: (Trait | Identifier | IdentifierPair)[]): void;
  get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
  get<T extends Trait, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
  destroy(): void;
  reset(): void;
  /**
   * Runs the function with structural changes deferred, as a walk does, and returns its result.
   * Adds, removes, destroys and machine transitions made inside apply in call order when the
   * outermost scope ends. Use it around for...of and indexed loops over query entities.
   */
  defer<T>(fn: () => T): T;
  query<T extends QueryParameter[]>(key: Query<T>): QueryView<T>;
  query<T extends QueryParameter[]>(...parameters: T): QueryView<T>;
  queryFirst<T extends QueryParameter[]>(key: Query<T>): Entity | undefined;
  queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
  /** Observe future entries into a query. Existing matches are not replayed. */
  onEnter<T extends QueryParameter[]>(
    key: Query<T>,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  /** Observe future entries into a query. Existing matches are not replayed. */
  onEnter<T extends QueryParameter[]>(
    parameters: T,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  /** Observe entities leaving a query. */
  onExit<T extends QueryParameter[]>(
    key: Query<T>,
    callback: (entity: Entity) => void
  ): QueryUnsubscriber;
  /** Observe entities leaving a query. */
  onExit<T extends QueryParameter[]>(
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
  onTransition<S extends MachineStates>(
    machine: Machine<S>,
    callback: TransitionSubscriber<S[keyof S]>
  ): QueryUnsubscriber;
  onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber;
  onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber;
  onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber;
};
