import type { ActionInstance } from '../actions';
import type { SettledCallback } from '../command/types';
import type { createEntityIndex } from '../entity/entity-index';
import type { Entity } from '../entity/types';
import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import type { $internal } from '../internal';
import type { Machine, MachineStates, TransitionSubscriber } from '../machine/types';
import type { createQueryStore } from '../query/store';
import type {
  InlineQueryNode,
  Query,
  QueryInstance,
  QueryNotification,
  QueryParameter,
  QuerySubscriber,
  QueryUnsubscriber,
  QueryView,
} from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitHook,
  TraitInit,
  TraitInstance,
  TraitOut,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { IterationBuffers } from '../view/types';

export type WorldContext = {
  entityIndex: ReturnType<typeof createEntityIndex>;
  /**
   * Membership and removal history by mask generation and page. Worlds that share entity ids
   * share these tables. See trait/mask-table.ts.
   */
  entityMasks: Uint32Array[][];
  /** A table of empty pages as long as the mask tables, which a new generation starts from. */
  emptyMaskTable: Uint32Array[];
  /** Pages of ids the world's tracker tables cover. */
  pageLimit: number;
  traitInstances: (TraitInstance | undefined)[];
  /** Trait instances by mask generation and bit index, so a mask word can be walked back to its traits. */
  traitsByBit: TraitInstance[][];
  traits: Set<Trait>;
  relations: Relation<Trait>[];
  queriesHashMap: Map<string, QueryInstance>;
  /** Inline parameter lists already resolved, as a tree with one level per parameter. */
  inlineQueries: InlineQueryNode;
  queryInstances: (QueryInstance | undefined)[];
  iterationBuffers: IterationBuffers | undefined;
  actionInstances: (ActionInstance | undefined)[];
  /** Tracking queries, and static queries that an entity holding no traits satisfies. */
  notQueries: QueryInstance[];
  queryBatch: QueryNotification[] | undefined;
  targetQuerySubscriptions:
    WeakMap<QueryInstance, { add: Set<QuerySubscriber>; remove: Set<QuerySubscriber> }> | undefined;
  /** Some entity may hold a pending bit, so membership changes clear the pending word. */
  defersChanges: boolean;
  /**
   * Moves when a change subscriber or a Changed query is added. A binding found untracked at the
   * current value walks without change detection until it moves again.
   */
  trackingRevision: number;
  /** Queries indexed by target entity page and offset. */
  targetQueries: (QueryInstance[] | undefined)[][];
  /** Deferred structural changes as flat entries of command, entity and two arguments. */
  commands: unknown[];
  /** Entries in use. The array keeps its store between flushes and is cleared in bulk. */
  commandCount: number;
  /** Set when a command or a settled callback is queued, so a scope end reads one field. */
  unsettled: boolean;
  /** Pending entities in this world's current destruction cascade. */
  destroyQueue: Entity[];
  /** Target and awaiting bits paged by entity id. See relation/cascade.ts. */
  targetFlags: (Uint8Array | undefined)[];
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
  /** The entity that carries the world's own traits. Null once the world is destroyed. */
  worldEntity: Entity | null;
  entitySubscribedInstances: Set<TraitInstance>;
  /** Open defer scopes. Structural changes join the command log while it is nonzero. See command/buffer.ts. */
  deferDepth: number;
  settledCallbacks: WeakMap<() => void, SettledCallback> | undefined;
  settledQueue: (SettledCallback | undefined)[];
  settledCount: number;
  settledRound: number;
  createQueryStore: typeof createQueryStore;
  /** Notifies after registration, reset or destruction changes the backing entity. */
  resetSubscriptions: Set<() => void>;
  entitySpawnSubscriptions: Set<(entity: Entity) => void>;
  entityDestroySubscriptions: Set<(entity: Entity) => void>;
  traitRegisteredSubscriptions: Set<(trait: Trait) => void>;
};

export type WorldOptions = {
  /**
   * Maximum retained destroyed entities. Defaults to 1024. Overflow evicts the oldest even if
   * a Removed reader has not consumed it. Zero disables destroyed-entity retention.
   * Must be a non-negative safe integer.
   */
  retain?: number;
};

/** A trait event subscription. With an entity first it only fires for that entity. */
type WorldHook = TraitHook & TraitHook<[entity: Entity]>;

export type World = {
  /** The retention cap set at creation. Read-only and preserved by reset. */
  readonly retain: number;
  readonly id: number;
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
  /** With an entity alone, whether it is alive. With a trait alone, whether the world has it. */
  has(entity: Entity): boolean;
  has(entity: Entity, trait: Trait | RelationPair | Identifier | IdentifierPair): boolean;
  has(trait: Trait | Identifier | IdentifierPair): boolean;
  add(entity: Entity, ...traits: ConfigurableTrait[]): void;
  add(...traits: ConfigurableTrait[]): void;
  /** Set the value if the trait or pair is present, or add it with the value if it is not. */
  upsert<T extends Trait | RelationPair>(
    entity: Entity,
    trait: T,
    value: TraitInit<ExtractSchema<T>>
  ): void;
  upsert<T extends Trait>(trait: T, value: TraitInit<ExtractSchema<T>>): void;
  remove(entity: Entity, ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]): void;
  remove(...traits: (Trait | Identifier | IdentifierPair)[]): void;
  get<T extends Trait | RelationPair>(
    entity: Entity,
    trait: T
  ): TraitRecord<ExtractSchema<T>> | undefined;
  /** Fills out in place and returns it, without allocating. */
  get<T extends Trait | RelationPair, O extends TraitOut<T>>(
    entity: Entity,
    trait: T,
    out: O
  ): O | undefined;
  get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
  get<T extends Trait, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  set<T extends Trait | RelationPair>(
    entity: Entity,
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    flagChanged?: boolean
  ): void;
  set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
  changed(entity: Entity, trait: Trait): void;
  changed(trait: Trait): void;
  targetFor<K extends IdentifierKey>(entity: Entity, identifier: Identifier<K>): K | undefined;
  targetFor<T extends Trait>(entity: Entity, relation: Relation<T>): Entity | undefined;
  targetsFor<K extends IdentifierKey>(entity: Entity, identifier: Identifier<K>): K[];
  targetsFor<T extends Trait>(entity: Entity, relation: Relation<T>): Entity[];
  destroy(entity: Entity): void;
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
  onAdd: WorldHook;
  onRemove: WorldHook;
  /** Reports future additions and writes. Removals use onRemove. */
  onChange: WorldHook;
  /** Reports transitions of one entity, or of every entity with the machine. */
  onTransition<S extends MachineStates>(
    entity: Entity,
    machine: Machine<S>,
    callback: TransitionSubscriber<S[keyof S]>
  ): QueryUnsubscriber;
  onTransition<S extends MachineStates>(
    machine: Machine<S>,
    callback: TransitionSubscriber<S[keyof S]>
  ): QueryUnsubscriber;
  onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber;
  onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber;
  onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber;
};
