import { assertsEnabled } from '../build-flags';
import { getEntityId, PAGE_SIZE } from '../entity/handle';
import { createPageTable, growPageTable } from '../entity/page-table';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { reconcileTraitQueries } from '../query/reconciliation';
import type { WorldContext } from '../world/types';
import { getTraitInstance, hasTraitInstance, registerTrait } from './registry';
import type { Trait, TraitInstance } from './types';

/** Set membership and advance revisions without reconciling queries. */
/** @inline */
export function setTraitMembership(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const eid = getEntityId(entity);
  const generation = instance.masks;
  let page = generation[eid >>> 10];
  if (page === EMPTY_MASK_PAGE) page = createMaskPage(generation, eid >>> 10);
  page[(eid & 1023) << 2] |= instance.bitflag;
  instance.version++;
}

/** Clear held membership and retain its removal without reconciling queries. */
/** @inline */
export function clearTraitMembership(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const eid = getEntityId(entity);
  const page = instance.masks[eid >>> 10];
  const slot = (eid & 1023) << 2;
  page[slot] &= ~instance.bitflag;
  page[slot + REMOVED_WORD] |= instance.bitflag;
  instance.version++;
}

/**
 * The same clear for the destroy walk, which brings a different instance for each trait of the
 * entity. There the table is reached through the world, since the read through the instance
 * is slower in that loop.
 */
/** @inline */
export function clearDyingTraitMembership(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance
) {
  const eid = getEntityId(entity);
  const page = ctx.entityMasks[instance.generationId][eid >>> 10];
  const slot = (eid & 1023) << 2;
  page[slot] &= ~instance.bitflag;
  page[slot + REMOVED_WORD] |= instance.bitflag;
  instance.version++;
}

/** Throws unless the entity holds the trait. */
export /* @inline */ function assertTraitMembership(ctx: WorldContext, entity: Entity, trait: Trait) {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  const eid = getEntityId(entity);
  if (
    instance === undefined ||
    (instance.masks[eid >>> 10][(eid & 1023) << 2] & instance.bitflag) === 0
  ) {
    throw createTraitMembershipError(entity, trait);
  }
}

export const createTraitMembershipError = (entity: Entity, trait: Trait, setting = false): Error => {
  return new Error(
    `Koota: [TRAIT_PRESENT] Add the trait before ${setting ? 'setting it' : 'changing or writing it'}. Entity ${entity}, trait ${trait.id}.`
  );
};

export /* @inline @pure */ function hasTraitMembership(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait
): boolean {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) return false;

  const { masks, bitflag } = instance;
  const eid = getEntityId(entity);
  const mask = masks[eid >>> 10][(eid & 1023) << 2];

  return (mask & bitflag) === bitflag;
}

/**
 * Grants membership of a trait the entity does not hold yet, registering the trait first.
 * Returns the instance when it granted and undefined when the entity already held the trait.
 */
/* @inline */
export function ensureTraitMembership(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait
): TraitInstance | undefined {
  if (hasTraitMembership(ctx, entity, trait)) return undefined;

  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  grantTraitMembership(ctx, entity, instance);
  return instance;
}

/** Flip the membership bit and reconcile every query that includes the trait. */
export function grantTraitMembership(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  setTraitMembership(ctx, entity, instance);
  reconcileTraitQueries(ctx, entity, instance, 'add');
}

/**
 * Clear the membership bit and reconcile every query that includes the trait. An entity that
 * does not hold the trait is left alone.
 */
export function revokeTraitMembership(ctx: WorldContext, entity: Entity, trait: Trait): void {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance === undefined) return;
  const eid = getEntityId(entity);
  const mask = instance.masks[eid >>> 10][(eid & 1023) << 2];
  if ((mask & instance.bitflag) === 0) return;

  /* @cold */ if (assertsEnabled && trait[$internal].relation) {
    const targets = instance.relationTargets?.[eid >>> 10]?.[eid & 1023];
    if (typeof targets === 'number' || (targets !== undefined && targets.length > 0)) {
      throw new Error(
        `Koota: [RELATION_INDEX] Remove relation targets before removing their trait membership. Entity ${entity}, trait ${trait.id}.`
      );
    }
  }
  clearTraitMembership(ctx, entity, instance);
  reconcileTraitQueries(ctx, entity, instance, 'remove');
}

/**
 * The layout of ctx.entityMasks. Four words per entity hold current traits, removed traits,
 * traits held at destruction and traits with a write pending for their Changed queries. Entity
 * slots are shift-indexed as (eid & 1023) << 2.
 */
const MASK_STRIDE = 4;
export const REMOVED_WORD = 1;
export const DESTROYED_WORD = 2;
export const PENDING_WORD = 3;

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE * MASK_STRIDE);

/** Materialize an entity mask page on first membership write. Returns the writable page. */
export function createMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  const page = new Uint32Array(PAGE_SIZE * MASK_STRIDE);
  gen[pageId] = page;
  return page;
}

/** Extend every mask table to cover the world's page limit. */
export function growMaskTables(ctx: WorldContext, pageLimit: number) {
  const masks = ctx.entityMasks;
  for (let g = 0; g < masks.length; g++) growPageTable(masks[g], pageLimit, EMPTY_MASK_PAGE);
}

/**
 * Moves the world to its next mask bit. A mask word holds 31 traits, so the bit after that
 * starts a new mask generation.
 */
export function advanceMaskBit(ctx: WorldContext) {
  ctx.bitflag *= 2;

  if (ctx.bitflag >= 2 ** 31) {
    ctx.bitflag = 1;
    ctx.entityMasks.push(createPageTable(ctx.pageLimit, EMPTY_MASK_PAGE));
    ctx.traitsByBit.push([]);
  }
}
