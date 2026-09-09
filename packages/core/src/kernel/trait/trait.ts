import { allocateEntity, isEntityAlive } from '../entity/entity-index';
import { prepareMembershipEntity } from '../entity/membership';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/pack-entity';
import { getRelationData, hasRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/is-relation';
import type { KernelContext } from '../context';
import { createEmptyMaskGeneration } from '../entity/paged-mask';
import { createSubscriptions } from './subscriptions';
import type { ExtractStore, Trait, TraitInstance } from './types';

export function registerTrait(ctx: KernelContext, trait: Trait, identity?: Entity): TraitInstance {
  const traitCtx = trait[$internal];
  const existing = getTraitInstance(ctx.traitInstances, trait);
  if (existing && existing.entity >= 0) return existing;
  const entity = identity ?? allocateEntity(ctx.entityIndex);
  prepareMembershipEntity(ctx.memberships, entity);
  if (identity === undefined) ctx.implicitEntities.add(entity);
  if (existing) {
    existing.entity = entity;
    ctx.definitions.set(entity, existing);
    return existing;
  }

  const data: TraitInstance = {
    entity,
    pairs: new Map(),
    version: 0,
    generationId: ctx.entityMasks.length - 1,
    bitflag: ctx.bitflag,
    trait,
    store: traitCtx.createStore(),
    queries: new Set(),
    trackingQueries: new Set(),
    relationQueries: new Set(),
    changeSubscriptions: createSubscriptions(),
    addSubscriptions: createSubscriptions(),
    removeSubscriptions: createSubscriptions(),
  };

  setTraitInstance(ctx.traitInstances, trait, data);
  ctx.definitions.set(entity, data);
  ctx.traits.add(trait);

  incrementTraitBitflag(ctx);

  traitCtx.onRegister?.(ctx);

  if (ctx.traitRegisteredSubscriptions.size > 0) {
    for (const sub of ctx.traitRegisteredSubscriptions) sub(trait);
  }
  return data;
}

export function hasTrait(ctx: KernelContext, entity: Entity, trait: Trait): boolean {
  if (!ctx || !isEntityAlive(ctx.entityIndex, entity)) return false;
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) return false;

  const { generationId, bitflag } = instance;
  const eid = getEntityId(entity);
  const mask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];

  return (mask & bitflag) === bitflag;
}

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
  ctx: KernelContext,
  trait: C
): ExtractStore<C> {
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  return instance.store as ExtractStore<C>;
}

export function getTrait(ctx: KernelContext, entity: Entity, trait: Trait | RelationPair) {
  if (isRelationPair(trait)) return getTraitForPair(ctx, entity, trait);
  return getTraitForTrait(ctx, entity, trait);
}

/* @inline @pure */ function getTraitForPair(ctx: KernelContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  if (!hasRelationPair(ctx, entity, pair)) return undefined;
  if (typeof target !== 'number') return undefined;

  return getRelationData(ctx, entity, relation, target);
}

/* @inline @pure */ function getTraitForTrait(ctx: KernelContext, entity: Entity, trait: Trait) {
  if (!hasTrait(ctx, entity, trait)) return undefined;

  const traitCtx = trait[$internal];
  const store = getStore(ctx, trait);
  const data = traitCtx.get(getEntityId(entity), store);

  return data;
}

// ---------------------------------------------------------------------------
// Instance table: TraitInstance records indexed by trait id.
// ---------------------------------------------------------------------------
export type TraitInstanceArray = (TraitInstance | undefined)[];

/**
 * Get TraitInstance by trait ID
 */
export /* @inline @pure */ function getTraitInstance(
  traitData: TraitInstanceArray,
  trait: Trait
): TraitInstance | undefined {
  return traitData[trait[$internal].id];
}

/**
 * Set TraitInstance by trait ID
 */
export /* @inline */ function setTraitInstance(
  traitData: TraitInstanceArray,
  trait: Trait,
  data: TraitInstance
): void {
  const traitId = trait[$internal].id;
  // Ensure array is large enough
  if (traitId >= traitData.length) {
    traitData.length = traitId + 1;
  }
  traitData[traitId] = data;
}

/**
 * Check if trait is registered
 */
export /* @inline @pure */ function hasTraitInstance(
  traitData: TraitInstanceArray,
  trait: Trait
): boolean {
  const traitId = trait[$internal].id;
  return traitId < traitData.length && traitData[traitId] !== undefined;
}

/**
 * Clear all trait data
 */
export /* @inline */ function clearTraitInstance(traitData: TraitInstanceArray): void {
  traitData.length = 0;
}

// ---------------------------------------------------------------------------
// Bitflag allocation across mask generations.
// ---------------------------------------------------------------------------
export /* @inline */ function incrementTraitBitflag(ctx: KernelContext) {
  ctx.bitflag *= 2;

  if (ctx.bitflag >= 2 ** 30) {
    ctx.bitflag = 1;
    ctx.entityMasks.push(createEmptyMaskGeneration());

    for (const m of ctx.dirtyMasks.values()) m.push(createEmptyMaskGeneration());
    for (const m of ctx.changedMasks.values()) m.push(createEmptyMaskGeneration());
    for (const m of ctx.trackingSnapshots.values()) m.push(createEmptyMaskGeneration());
  }
}
