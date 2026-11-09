import { $internal } from '../../common';
import { assertsEnabled } from '../../assert-config';
import { assertEntityAlive, assertTraitPresent } from '../../asserts';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { isEntityAlive } from '../../entity/utils/entity-index';
import { hasRelationToTarget, reconcileRelationQueries } from '../../relation/relation';
import type { RelationPair } from '../../relation/types';
import { emit, hasSubscribers } from '../../trait/subscriptions';
import { getTraitInstance } from '../../trait/trait-instance';
import type { ExtractModifierTraits, Trait, TraitInstance, TraitInput } from '../../trait/types';
import type { WorldContext } from '../../world';
import { beginDefer, endDefer } from '../../world/defer';
import { internModifier, type ModifierCache } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';
import { notifyChangedTrackingQueries } from '../utils/mark-tracked-trait-changed';

export function createChanged() {
  const id = createTrackingId();
  const type = `changed-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `changed-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `changed-${number}`
    >;
  };
}

/** @inline */
function getPresentTrait(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return;
  const index = getEntityId(entity);
  if ((ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
    return;
  return data;
}

export function setChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }
  const data = getPresentTrait(ctx, entity, trait);
  if (!data) {
    if (assertsEnabled) {
      assertTraitPresent(ctx, entity, trait);
    }
    return;
  }
  notifyTraitChanged(ctx, entity, data);
}

/** Notify after a validated write. A removed trait has no change to publish. */
export function notifyChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = getPresentTrait(ctx, entity, trait);
  if (data) notifyTraitChanged(ctx, entity, data);
}

/** The caller must validate membership and finish the write without reentering the core. */
export /* @inline */ function notifyTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (data.trackingQueries.length !== 0 || hasSubscribers(data.changeSubscriptions)) {
    notifyChangeSubscribers(ctx, entity, data, undefined);
  }
}

/**
 * Query reconciliation can call user hooks too. Hold one scope across tracking queries and
 * trait subscribers so every notification sees the write before structural follow-up work.
 */
export function notifyChangeSubscribers(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  target: Entity | undefined
) {
  beginDefer(ctx);
  try {
    if (data.trackingQueries.length !== 0) {
      notifyChangedTrackingQueries(ctx, entity, data);
      if (target !== undefined) {
        reconcileRelationQueries(ctx, data, entity, target, 'change', true);
      }
    }
    emit(data.changeSubscriptions, entity, target);
  } finally {
    endDefer(ctx);
  }
}

export function setPairChanged(ctx: WorldContext, entity: Entity, trait: Trait, target: Entity) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return;
  const index = getEntityId(entity);
  if ((ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
    return;
  data.version++;
  if (data.trackingQueries.length !== 0 || hasSubscribers(data.changeSubscriptions)) {
    notifyChangeSubscribers(ctx, entity, data, target);
  }
}

/** Add notifications follow onAdd, once the initial value is available. */
export /* @inline */ function notifyTraitAdded(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  target?: Entity
) {
  if (hasSubscribers(data.changeSubscriptions)) {
    emitAddedChange(ctx, entity, data, target);
  }
}

/** An earlier event callback may have removed the trait, pair or entity. */
export function emitAddedChange(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  target: Entity | undefined
) {
  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  const eid = getEntityId(entity);
  if ((ctx.entityMasks[data.generationId][eid >>> 10][(eid & 1023) << 2] & data.bitflag) === 0)
    return;
  if (
    target !== undefined &&
    !hasRelationToTarget(ctx, data.trait[$internal].relation!, entity, target)
  )
    return;
  emit(data.changeSubscriptions, entity, target);
}
