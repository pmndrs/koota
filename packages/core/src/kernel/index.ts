/**
 * The kernel's public contract.
 *
 * `src/api` imports from this file and nowhere else inside `src/kernel`, so this
 * list is the whole surface the interface layer is allowed to depend on. Adding
 * an export here widens what the engine has to keep stable — do it deliberately.
 */

// Errors
export { isKernelError } from './errors';
export type { KernelError, KernelErrorCode } from './errors';

// Context & lifecycle
export {
  createKernelContext,
  destroyKernel,
  initializeKernel,
  resetKernel,
  releaseKernelResources,
} from './context';
export type { KernelContext } from './context';
export type { PageCleanupToken } from './entity/page-allocator';

// Entities
export { getEntityGeneration, getEntityId, unpackEntity } from './entity/pack-entity';
export { getAliveEntities, isEntityAlive } from './entity/entity-index';

// Traits
export { createTrait } from './trait/create-trait';
export {
  getStore,
  getTrait,
  getTraitInstance,
  hasTrait,
  hasTraitInstance,
  registerTrait,
} from './trait/trait';
export type {
  Trait,
  TagTrait,
  TraitHooks,
  TraitInstance,
  TraitRecord,
  TraitType,
  TraitValue,
} from './trait/types';
export { hasSubscribers, subscribeEntity } from './trait/subscriptions';
export type { Subscriber } from './trait/subscriptions';

// Relations
export {
  getEntitiesWithRelationTo,
  getFirstRelationTarget,
  getRelationTargets,
  hasRelationPair,
} from './relation/relation';
export { isRelation, isRelationPair } from './relation/is-relation';
export { $relation, $relationPair } from './relation/symbols';
export type { Relation } from './relation/types';

// Queries
export { createQuery, createQueryInstance, queryInternal, runQuery } from './query/query';
export { $modifier, createModifier, isModifier } from './query/modifier';
export { isQuery } from './query/is-query';
export { createQueryHash } from './query/create-query-hash';
export { createTrackingId, setTrackingMasks } from './query/tracking-cursor';
export { $parameters, $queryRef } from './query/symbols';
export type { QueryInstance } from './query/types';

// Commands
export {
  addTrait,
  createEntity,
  destroyEntity,
  removeTrait,
  setChanged,
  setTrait,
} from './commands/operations';
export {
  recordAdd,
  recordChanged,
  recordDestroy,
  recordRemove,
  recordSet,
  recordSpawn,
} from './commands/recording';
export { clearBuffer, createBufferState } from './commands/buffer-state';
export type { CommandBufferState } from './commands/buffer-state';
export { flushCommands } from './commands/interpreter';

// Storage
export type { AoSFactory, Norm, Schema, Store, StoreType } from './storage/types';

// Shared
export { $internal } from './common';
export { universe } from './universe';
