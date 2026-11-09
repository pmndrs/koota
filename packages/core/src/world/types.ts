import type { observeSettled } from './settled';
import { ActionInstance } from '../actions/types';
import type { Machine, MachineStates, TransitionSubscriber } from '../machine/types';
import type { QueryNotification, QuerySubscriber } from '../query/types';
import type { $internal } from '../common';
import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import type { Entity, Hook } from '../entity/types';
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
  queryCallbackDepth: number;
  queryBatch: QueryNotification[] | undefined;
  internalQuerySubscriptions:
    WeakMap<QueryInstance, { add: Set<QuerySubscriber>; remove: Set<QuerySubscriber> }> | undefined;
  machineMutations: Set<Entity> | undefined;
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
  /** The entity that carries the world's own traits. Null once the world is destroyed. */
  worldEntity: Entity | null;
  /**
   * Entities already visited by the destroy in progress, as a stamp and a packed entity per id.
   * The stamp changes per outer call so nothing is cleared between destroys. The packed entity
   * is kept so a recycled id is not mistaken for the entity that was destroyed before it.
   * Sized to the leased pages with the mask tables so a first write at a high id stays dense.
   */
  destroyMarks: Uint32Array;
  destroyStamp: number;
  destroyQueue: Entity[];
  isDestroying: boolean;
  entitySubscribedInstances: Set<TraitInstance>;
  structuralDepth: number;
  settledQueue: Set<() => void>;
  observeSettled: typeof observeSettled;
  resetSubscriptions: Set<() => void>;
  entitySpawnSubscriptions: Set<(entity: Entity) => void>;
  entityDestroySubscriptions: Set<(entity: Entity) => void>;
  traitRegisteredSubscriptions: Set<(trait: Trait) => void>;
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

/** A trait event subscription. With an entity first it only fires for that entity. */
export type WorldHook = Hook & Hook<[entity: Entity]>;

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
  isAlive(entity: Entity): boolean;
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
  /** Observe transitions of one entity, or of every entity with the machine. */
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
