export { createActions } from './actions/create-actions';
export type { Actions, ActionsInitializer, ActionRecord } from './actions/types';
export { $internal } from '../kernel';
export type { CommandBuffer } from './commands/command-buffer';
export type { Entity } from './entity/types';
export { unpackEntity } from '../kernel';
export { shallowEqual } from './utils/shallow-equal';
export { createAdded, createChanged, createRemoved, Not, Or } from './query/modifiers';
export { $modifier } from '../kernel';
export { createQuery, IsExcluded, getQueryVersion } from './query/query';
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
  QueryResult,
  QueryResultOptions,
  QuerySubscriber,
  QueryUnsubscriber,
  QueryHash,
  StoresFromParameters,
  PageStoresFromParameters,
} from './query/types';
export { $queryRef } from '../kernel';
export { relation } from './relation/relation';
/** @experimental This API is experimental and may change or be removed in future versions. */
export { ordered } from './relation/ordered';
/** @experimental This API is experimental and may change or be removed in future versions. */
export { OrderedList } from './relation/ordered-list';
export { $relationPair, $relation } from '../kernel';
export type {
  /** @experimental This type is experimental and may change or be removed in future versions. */
  OrderedRelation as OrderedTrait,
  RelationInputTarget,
  Relation,
  RelationPair,
  RelationTarget,
} from './relation/types';
export { getStore, trait, getTraitVersionSource } from './trait/trait';
export type {
  ConfigurableTrait,
  ExtractIsTag,
  ExtractSchema,
  ExtractStore,
  IsTag,
  SetTraitCallback,
  TagTrait,
  Trait,
  TraitRecord,
  TraitTuple,
  TraitValue,
  TraitHooks,
} from './trait/types';
export type { AoSFactory, Norm, Schema, Store, StoreType } from '../kernel';
export type { TraitType } from './trait/types';
export { universe } from '../kernel';
export type { World } from './world';
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
