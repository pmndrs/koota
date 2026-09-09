import { type $internal, type KernelContext } from '../../kernel';
import { ActionInstance } from '../actions/types';
import type { CommandBuffer } from '../commands/command-buffer';
import type { Entity } from '../entity/types';
import type { Query, QueryParameter, QueryResult, QueryUnsubscriber } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitRecord,
  TraitValue,
} from '../trait/types';

export type WorldContext = {
  kernel: KernelContext;
  worldEntity: Entity | undefined;
  actionInstances: (ActionInstance | undefined)[];
  resetSubscriptions: Set<() => void>;
};

export type World = {
  readonly id: number;
  readonly isRegistered: boolean;
  readonly entities: Entity[];
  readonly traits: Set<Trait>;
  [$internal]: WorldContext;
  spawn(...traits: ConfigurableTrait[]): Entity;
  createCommandBuffer(): CommandBuffer;
  flush(...buffers: CommandBuffer[]): void;
  has(entity: Entity): boolean;
  has(trait: Trait): boolean;
  has(target: Entity | Trait): boolean;
  add(...traits: ConfigurableTrait[]): void;
  remove(...traits: Trait[]): void;
  get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
  set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
  destroy(): void;
  reset(): void;
  query<T extends QueryParameter[]>(key: Query<T>): QueryResult<T>;
  query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
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
