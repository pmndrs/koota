import { assertsEnabled } from '../build-flags';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { reconcileTraitQueries } from '../query/reconciliation';
import type { WorldContext } from '../world/types';
import { createMaskPage, EMPTY_MASK_PAGE, REMOVED_WORD } from './mask-table';
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
