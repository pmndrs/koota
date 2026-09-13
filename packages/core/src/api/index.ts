export { createActions } from './actions/create-actions';
export type { Actions, ActionsInitializer, ActionRecord } from './actions/types';
export { $internal, $modifier, $queryRef, $relation, $relationPair } from './symbols';
export type { CommandBuffer } from './commands/command-buffer';
export type { Entity } from './entity/types';
export { unpackEntity, universe } from './universe';
export { shallowEqual } from './utils/shallow-equal';
export { createAdded, createChanged, createRemoved, Not, Or } from './query/modifiers';
export { createQuery, getQueryVersion, IsExcluded } from './query/query';
export type {
  EventType,
  InstancesFromParameters,
  IsNotModifier,
  Modifier,
  QueryPage,
  Query,
  QueryModifier,
  QueryParameter,
  QueryResult,
  QueryResultOptions,
  QuerySubscriber,
  QueryUnsubscriber,
  QueryHash,
  StoresFromParameters,
  PageStoresFromParameters,
} from './query/types';
export { relation } from './relation/relation';
export type {
  RelationInputTarget,
  Relation,
  RelationHook,
  RelationPair,
  RelationTarget,
} from './relation/types';
export { getTraitVersionSource, trait } from './trait/trait';
export type {
  AoSFactory,
  ConfigurableTrait,
  ExtractIsTag,
  ExtractSchema,
  ExtractStore,
  IsTag,
  Norm,
  Schema,
  SetTraitCallback,
  Store,
  StoreType,
  TagTrait,
  Trait,
  TraitHook,
  TraitHooks,
  TraitRecord,
  TraitTuple,
  TraitType,
  TraitValue,
} from './trait/types';
export type { World, WorldContext } from './world/types';
export { createWorld } from './world/world';

/**
 * Deprecations. To be removed in v0.7.0.
 */

import { createQuery } from './query/query';
/** @deprecated Use createQuery instead */
export const cacheQuery = createQuery;
