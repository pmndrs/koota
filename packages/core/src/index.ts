import { createQuery } from './query/query';
import type { TraitInstance } from './trait/types';

export { $internal } from './internal';
export { machine } from './machine/machine';
export type {
  Machine,
  MachineOptions,
  MachineStates,
  MachineStateInput,
  TransitionSubscriber,
} from './machine/types';
export { createActions } from './actions';
export type { Actions, ActionsInitializer, ActionRecord } from './actions';
export type { Entity, EntityMethods, Register } from './entity/types';
export { getEntityId, unpackEntity } from './entity/handle';
export { createAdded, createChanged, createRemoved, Not, Or } from './query/modifiers';
export { $modifier, $query, createQuery } from './query/query';
export { IsExcluded } from './query/terms';
export type {
  QueryLayout,
  QueryPage,
  StoresFromParameters,
  PageStoresFromParameters,
} from './query/types';
export type {
  EventType,
  IsNotModifier,
  Modifier,
  Query,
  QueryModifier,
  QueryParameter,
  QueryView,
  QuerySubscriber,
  QueryUnsubscriber,
  QueryHash,
} from './query/types';
export { $identifier, $identifierPair, identifier } from './identifier/identifier';
export type {
  Identifier,
  IdentifierKey,
  IdentifierOptions,
  IdentifierPair,
} from './identifier/types';
export { $relation, $relationPair, relation } from './relation/relation';
export { ordered, isOrderedTrait } from './relation/ordered';
export type {
  InstancesFromParameters,
  UpdateEachOptions,
  EntityComparator,
  EntityView,
  OrderedView,
  MutableOrderedView,
  SortKeySelector,
} from './view/types';
export type {
  OrderedRelation as OrderedTrait,
  RelationInputTarget,
  Relation,
  RelationPair,
  RelationTarget,
} from './relation/types';
export { getStore } from './trait/registry';
export { trait } from './trait/trait';
export { required } from './storage/schema';
export type {
  ConfigurableTrait,
  ExtractIsTag,
  ExtractSchema,
  ExtractStore,
  IsTag,
  SetTraitCallback,
  TagTrait,
  Trait,
  TraitOut,
  TraitInit,
  TraitRecord,
  TraitTuple,
  TraitValue,
} from './trait/types';
export type { AoSFactory, Norm, RequiredField, Schema, Store, StoreType } from './storage/types';
export type { TraitType } from './trait/types';
export type { World, WorldOptions } from './world/types';
export { createWorld } from './world/world';
export { whenSettled } from './command/settled';

/** @deprecated Use $query instead. */
export { $query as $queryRef } from './query/query';

/** @deprecated Use createQuery instead */
export const cacheQuery = createQuery;

/** @deprecated Use TraitInstance instead */
export type TraitData = TraitInstance;

/** @deprecated Will remove this internal type entirely. */
export type { TraitInstance } from './trait/types';

/** @deprecated Will remove this internal type entirely. */
export type { QueryInstance } from './query/types';
