export { machine } from './machine/machine';
export type {
  Machine,
  MachineOptions,
  MachineStates,
  MachineStateInput,
  TransitionSubscriber,
} from './machine/types';
export { createActions } from './actions/create-actions';
export type { Actions, ActionsInitializer, ActionRecord } from './actions/types';
export { $internal } from './common';
export type { Entity } from './entity/types';
export { unpackEntity } from './entity/utils/pack-entity';
export { shallowEqual } from './utils/shallow-equal';
export { createAdded } from './query/modifiers/added';
export { createChanged } from './query/modifiers/changed';
export { Not } from './query/modifiers/not';
export { Or } from './query/modifiers/or';
export { createRemoved } from './query/modifiers/removed';
export { $modifier } from './query/modifier';
export { createQuery, IsExcluded } from './query/query';
export type {
  EventType,
  InstancesFromParameters,
  IsNotModifier,
  Modifier,
  QueryLayout,
  QueryPage,
  Query,
  QueryModifier,
  QueryParameter,
  QueryView,
  UpdateEachOptions,
  QuerySubscriber,
  QueryUnsubscriber,
  QueryHash,
  StoresFromParameters,
  PageStoresFromParameters,
} from './query/types';
export { $queryRef } from './query/symbols';
export { identifier } from './identifier/identifier';
export { $identifier, $identifierPair } from './identifier/symbols';
export type {
  Identifier,
  IdentifierKey,
  IdentifierOptions,
  IdentifierPair,
} from './identifier/types';
export { relation } from './relation/relation';
export { ordered, isOrderedTrait } from './relation/ordered';
export type {
  EntityComparator,
  EntityView,
  OrderedView,
  MutableOrderedView,
  SortKeySelector,
} from './view/types';
export { $relationPair, $relation } from './relation/symbols';
export type {
  OrderedRelation as OrderedTrait,
  RelationInputTarget,
  Relation,
  RelationPair,
  RelationTarget,
} from './relation/types';
export { getStore, trait } from './trait/trait';
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
export type { World, WorldOptions } from './world';
export { createWorld } from './world';

/**
 * Deprecations. To be removed in v0.7.0.
 */

import { createQuery } from './query/query';
/** @deprecated Use createQuery instead */
export const cacheQuery = createQuery;

import type { TraitInstance } from './trait/types';
/** @deprecated Use TraitInstance instead */
export type TraitData = TraitInstance;

/** @deprecated Will remove this internal type entirely */
export type { TraitInstance } from './trait/types';

/** @deprecated Will remove this internal type entirely */
export type { QueryInstance } from './query/types';
