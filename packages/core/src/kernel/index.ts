/** The API depends on these operations and opaque handles, not engine record layouts. */
export * from './interface';
export type { KernelContext, QueryInstance, CommandBufferState, PageCleanupToken } from './handles';
export type { PreparedAccess, QueryPlan, QueryWorkspace, SpawnPlan } from './handles';
export { isKernelError } from './errors';
export type { KernelError, KernelErrorCode } from './errors';
export { getEntityGeneration, getEntityId, unpackEntity } from './entity/pack-entity';
export { createTrait } from './trait/create-trait';
export type {
  Trait,
  TagTrait,
  TraitHooks,
  TraitInstance,
  TraitRecord,
  TraitType,
  TraitValue,
} from './trait/types';
export type { Subscriber } from './trait/subscriptions';
export type { VersionSource } from './trait/observe';
export { isRelation, isRelationPair } from './relation/is-relation';
export { $relation, $relationPair } from './relation/symbols';
export type { Relation } from './relation/types';
export { createQuery } from './query/query';
export { $modifier, createModifier, isModifier } from './query/modifier';
export { isQuery } from './query/is-query';
export { createQueryHash } from './query/create-query-hash';
export { createTrackingId } from './query/tracking-cursor';
export { $parameters, $queryRef } from './query/symbols';
export type { AoSFactory, Norm, Schema, Store, StoreType } from './storage/types';
export { shallowEqual } from './utils/shallow-equal';
export { $internal } from './common';
/** Legacy diagnostic access. Runtime adapters must use operations instead. */
export { universe } from './universe';

export { createRelation } from './relation/create-relation';
