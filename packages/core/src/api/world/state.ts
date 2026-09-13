import type { Query as KernelQuery, TypeId, World as Kernel } from '../../kernel';
import type { ActionInstance } from '../actions/types';
import type { Entity } from '../entity/types';
import type { HandleOwner } from '../handles';
import type { ConfigurableTrait, Trait, VersionSource } from '../trait/types';
import type { World } from './types';

export type Subscriber = (entity: Entity, target?: Entity) => void;

export type EventSubscribers = {
  add: Set<Subscriber>;
  remove: Set<Subscriber>;
  change: Set<Subscriber>;
};

export type TraitSubscriptions = EventSubscribers & {
  /** Entity-scoped subscribers keyed by public handle. */
  byEntity: Map<Entity, EventSubscribers>;
};

export const CommandKind = {
  Spawn: 0,
  Destroy: 1,
  Add: 2,
  Remove: 3,
  Set: 4,
  Changed: 5,
} as const;

export type Command = {
  kind: number;
  entity: Entity;
  operand: unknown;
  value: unknown;
  flag: boolean;
};

/**
 * Engine-side state of a world. It is reachable from the global handle
 * registry, so it must never hold a strong reference to the world facade or
 * abandoned worlds could not be finalized.
 */
export type WorldState = HandleOwner & {
  worldRef: WeakRef<World>;
  kernel: Kernel | null;
  epoch: number;
  worldEntity: Entity | undefined;
  initialTraits: ConfigurableTrait[];
  actionInstances: (ActionInstance | undefined)[];
  resetSubscriptions: Set<() => void>;
  /** Traits used in this world since the last reset. */
  traits: Set<Trait>;
  traitRegisteredSubscribers: Set<(trait: Trait) => void>;
  spawnSubscribers: Set<(entity: Entity) => void>;
  destroySubscribers: Set<(entity: Entity) => void>;
  traitSubscriptions: Map<TypeId, TraitSubscriptions>;
  /** Kernel trait observers attach on the first subscription, so unobserved worlds pay nothing. */
  traitObserversAttached: boolean;
  versionSources: Map<TypeId, VersionSource>;
  /** Kernel queries by descriptor hash. */
  queries: Map<string, KernelQuery>;
  /** Entities that stand in for definitions, hidden from `world.entities`. */
  definitionEntities: Map<object, Entity>;
  hidden: Set<Entity>;
};
