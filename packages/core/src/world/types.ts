import { ActionInstance } from '../actions/types';
import type { $internal } from '../common';
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

export type WorldContext = {
  entityIndex: ReturnType<typeof createEntityIndex>;
  /**
   * Membership and history by mask generation and page, four words per entity: held, removed
   * and not regained, written since spawn, held at destroy. See paged-mask.
   */
  entityMasks: Uint32Array[][];
  names: Map<string, Entity>;
  bitflag: number;
  traitInstances: (TraitInstance | undefined)[];
  /** Trait instances by mask generation and bit index, so a mask word can be walked back to its traits. */
  traitsByBit: TraitInstance[][];
  traits: Set<Trait>;
  relations: Relation<Trait>[];
  queriesHashMap: Map<string, QueryInstance>;
  queryInstances: (QueryInstance | undefined)[];
  iterationBuffers: QueryIterationBuffers | undefined;
  actionInstances: (ActionInstance | undefined)[];
  notQueries: QueryInstance[];
  queryCallbackDepth: number;
  /** Queries indexed by target entity page and offset. */
  targetQueries: (QueryInstance[] | undefined)[][];
  dirtyQueries: Set<QueryInstance>;
  /** Destroyed entities the world still holds, a ring in destroy order. Zero length releases at destroy. */
  tombstones: Int32Array;
  /** The destroy serial of each ring entry. */
  tombstoneSerials: Float64Array;
  tombstoneHead: number;
  tombstoneCount: number;
  /** Counts destroys. Retaining readers stamp their runs with it to say what they have consumed. */
  destroySerial: number;
  /** Removed and Destroyed query instances. Their runs release the tombstones they have consumed. */
  retainingQueries: QueryInstance[];
  worldEntity: Entity;
  entitySubscribedInstances: Set<TraitInstance>;
  resetSubscriptions: Set<() => void>;
  entitySpawnSubscriptions: Set<(entity: Entity) => void>;
  entityDestroySubscriptions: Set<(entity: Entity) => void>;
  traitRegisteredSubscriptions: Set<(trait: Trait) => void>;
  isRegistered: boolean;
  pendingTraits: ConfigurableTrait[] | undefined;
  cleanupToken: import('../entity/utils/page-allocator').PageCleanupToken | null;
  structuralRevision: number;
};

export type WorldOptions = {
  /**
   * How many destroyed entities the world keeps readable at most. Removed and Destroyed queries
   * release them as they consume them, so the cap only bounds a world whose readers stall or do
   * not exist. Defaults to 1024. Zero releases every entity at destroy.
   */
  retain?: number;
};

export type World = {
  readonly id: number;
  readonly isRegistered: boolean;
  readonly entities: Entity[];
  readonly traits: Set<Trait>;
  [$internal]: WorldContext;
  spawn(...traits: ConfigurableTrait[]): Entity;
  lookup(name: string): Entity | undefined;
  has(entity: Entity): boolean;
  has(trait: Trait): boolean;
  has(target: Entity | Trait): boolean;
  add(...traits: ConfigurableTrait[]): void;
  remove(...traits: Trait[]): void;
  get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
  get<T extends Trait, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
  destroy(): void;
  reset(): void;
  /** Spawns an entity and destroys it at once, so only Destroyed queries and listeners see it. */
  emit(...traits: ConfigurableTrait[]): void;
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
