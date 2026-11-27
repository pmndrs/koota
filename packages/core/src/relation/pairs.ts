import { assertsEnabled } from '../build-flags';
import { assertEntityAlive, createEntityNotAliveError, isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import {
  moveScopedIdentifiers,
  releaseConflictingRootKeys,
  validateScopeMove,
} from '../identifier/scope';
import { $internal } from '../internal';
import { reconcileRelationQueries, reconcileTrackingQueries } from '../query/reconciliation';
import {
  emit,
  emitSubscribers,
  hasSubscribers,
  notifyTraitAdded,
  notifyPairChanged,
} from '../trait/hooks';
import {
  ensureTraitMembership,
  grantTraitMembership,
  hasTraitMembership,
  revokeTraitMembership,
} from '../trait/membership';
import { getTraitInstance, registerTrait } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { isDyingTarget } from './cascade';
import {
  assertPairRecordParams,
  clearPairRecords,
  getPairRecord,
  initPairRecord,
  removePairRecordAt,
  setPairRecord,
  setPairRecordAt,
} from './records';
import {
  addToRelationSources,
  clearRetainedTargets,
  ensureRelationPage,
  getExclusiveTarget,
  getStoredRelationTargets,
  getTargetIndex,
  hasRelationToTarget,
  removeFromRelationSources,
} from './targets';
import type { Relation, RelationPair } from './types';

export /* @inline */ function addRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;

  if (assertsEnabled) {
    assertRelationTarget(ctx, target);
  }
  // A deferred add can apply after its target died, and a destroy hook can spawn onto the entity
  // being destroyed after its relations were detached. Like a command on a dead entity, the pair
  // is dropped.
  if (
    typeof target !== 'number' ||
    !isEntityAlive(ctx.entityIndex, target) ||
    (ctx.destroying !== undefined && isDyingTarget(ctx, target))
  )
    return;

  const params = pair.params;
  const relationCtx = relation[$internal];
  const relationTrait = relationCtx.trait;

  // One read of what the entity holds tells whether it has the pair and, for an exclusive
  // relation, which target the new one replaces.
  const eid = getEntityId(entity);
  const known = getTraitInstance(ctx.traitInstances, relationTrait);
  const held = known?.relationTargets?.[eid >>> 10]?.[eid & 1023];
  if (relationCtx.exclusive ? held === target : held !== undefined && held.includes(target)) return;

  if (assertsEnabled) {
    if (relationTrait[$internal].required) assertPairRecordParams(relationTrait.schema, params);
  }

  if (relationCtx.scopedIdentifiers !== undefined) {
    setScopedRelationPair(ctx, entity, relation, target, params);
    return;
  }

  // Moving to another target is a whole removal, so it runs out of line.
  if (relationCtx.exclusive && held !== undefined) /* @cold */ {
    emit(known!.removeSubscriptions, entity, held);
    removeRelationTarget(ctx, relation, entity, held);
  }

  const added = ensureTraitMembership(ctx, entity, relationTrait);

  const targetIndex = addRelationTarget(ctx, relation, entity, target);

  // An entity that already had the relation had its instance before this call.
  const instance = added ?? known!;
  // Most relations carry no data, so the check stays here and the work is a call.
  if (relationTrait[$internal].type !== 'tag') {
    initPairRecord(ctx, entity, relation, instance, targetIndex, params);
  }
  if (added === undefined && instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(ctx, entity, instance, 'add');
  }
  notifyTraitAdded(entity, instance, target);
}

/** A scope edge and all of its identifier mappings change as one observable operation. */
export function setScopedRelationPair(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation,
  target: Entity | undefined,
  params: Record<string, any> | undefined
): boolean {
  if (ctx.destroying === entity || !isEntityAlive(ctx.entityIndex, entity)) return false;
  const trait = relation[$internal].trait;
  let instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance === undefined) instance = registerTrait(ctx, trait);
  const previous = getExclusiveTarget(ctx, relation, entity);
  if (previous === target) return true;
  if (!validateScopeMove(ctx, relation, entity, target)) return false;

  const present = hasTraitMembership(ctx, entity, trait);
  commitScopedRelationTarget(ctx, relation, entity, target);
  moveScopedIdentifiers(ctx, relation, entity, target);
  if (target !== undefined) {
    initPairRecord(ctx, entity, relation, instance, 0, params);
    if (!present) grantTraitMembership(ctx, entity, instance);
  }
  if (previous !== undefined) {
    reconcileRelationQueries(ctx, instance, entity, previous, 'remove', false);
  }
  if (target !== undefined) {
    reconcileRelationQueries(ctx, instance, entity, target, 'add', false);
    if (present && instance.trackingQueries.length !== 0) {
      reconcileTrackingQueries(ctx, entity, instance, 'add');
    }
  } else {
    revokeTraitMembership(ctx, entity, trait);
  }
  if (previous !== undefined) emit(instance.removeSubscriptions, entity, previous);
  // Subscribers run inside the defer scope of the move, so the edge holds through all of them.
  if (target !== undefined) notifyTraitAdded(entity, instance, target);
  return true;
}

/** Tell the pair subscribers and drop every target before a relation trait leaves an entity. */
export function releaseRelationTargets(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  relation: Relation<Trait>
) {
  if (relation[$internal].scopedIdentifiers !== undefined) {
    setScopedRelationPair(ctx, entity, relation, undefined, undefined);
    return;
  }
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance) emitPairRemovals(instance, entity);
  removeAllRelationTargets(ctx, relation, entity);
  revokeTraitMembership(ctx, entity, trait);
}

/** Tells the pair subscribers of every target the entity holds, before the targets are dropped. */
export function emitPairRemovals(instance: TraitInstance, entity: Entity) {
  if (!hasSubscribers(instance.removeSubscriptions)) return;
  // Subscribers run inside a defer scope, so the stored list holds still through the walk.
  const targets = getStoredRelationTargets(instance, entity);
  for (let i = 0; i < targets.length; i++) {
    emitSubscribers(instance.removeSubscriptions, entity, targets[i]);
  }
}

export /* @inline */ function removeRelationPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair
) {
  const relation = pair.relation;
  const target = pair.target;
  const relationTrait = relation[$internal].trait;

  if (!hasTraitMembership(ctx, entity, relationTrait)) return;
  if (relation[$internal].scopedIdentifiers !== undefined) {
    removeScopedRelationPair(ctx, entity, pair);
    return;
  }

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);

  if (target === '*') {
    if (instance) emitPairRemovals(instance, entity);
    removeAllRelationTargets(ctx, relation, entity);
    revokeTraitMembership(ctx, entity, relationTrait);
    return;
  }

  if (typeof target === 'number') {
    if (instance && hasSubscribers(instance.removeSubscriptions)) /* @cold */ {
      if (hasRelationToTarget(ctx, relation, entity, target)) {
        emitSubscribers(instance.removeSubscriptions, entity, target);
      }
    }

    const remaining = removeRelationTarget(ctx, relation, entity, target);
    if (remaining === 0) revokeTraitMembership(ctx, entity, relationTrait);
  }
}

/** A concrete removal only changes scope when it names the current parent. */
export function removeScopedRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  if (pair.target === '*' || getExclusiveTarget(ctx, pair.relation, entity) === pair.target) {
    setScopedRelationPair(ctx, entity, pair.relation, undefined, undefined);
  }
}

export function cleanupRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): void {
  if (relation[$internal].scopedIdentifiers !== undefined) /* @cold */ {
    releaseConflictingRootKeys(ctx, relation, entity);
    setScopedRelationPair(ctx, entity, relation, undefined, undefined);
    return;
  }
  const relationTrait = relation[$internal].trait;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);
  if (instance) emit(instance.removeSubscriptions, entity, target);

  const remaining = removeRelationTarget(ctx, relation, entity, target);
  if (remaining === 0) revokeTraitMembership(ctx, entity, relationTrait);
}

export /* @inline */ function getRelationPairRecord(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  out: Record<string, unknown> | undefined
) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  if (typeof target !== 'number') return undefined;

  return getPairRecord(ctx, entity, relation, target, out);
}

export /* @inline */ function setRelationPairRecord(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  value: any,
  triggerChanged: boolean
) {
  if (assertsEnabled) {
    setRelationPairRecordWithAsserts(ctx, entity, pair, value, triggerChanged);
  } else {
    const relation = pair.relation as Relation<Trait>;
    const target = pair.target;
    if (typeof target !== 'number') return;
    if (typeof value === 'function') {
      value = value(getPairRecord(ctx, entity, relation, target));
    }
    setPairRecord(ctx, entity, relation, target, value);
    if (triggerChanged) notifyPairChanged(ctx, entity, relation[$internal].trait, target);
  }
}

export function setRelationPairRecordWithAsserts(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  value: any,
  triggerChanged: boolean
) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  assertRelationTarget(ctx, target);
  let targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) {
    throw new Error(
      `Koota: [RELATION_PRESENT] Add the relation pair before setting it. Entity ${entity}, target ${target}, trait ${relation[$internal].trait.id}.`
    );
  }

  if (typeof value === 'function') {
    value = value(getPairRecord(ctx, entity, relation, target));
    // The callback holds no defer scope, so the pair is validated again and may have moved.
    assertEntityAlive(ctx, entity);
    assertRelationTarget(ctx, target);
    targetIndex = getTargetIndex(ctx, relation, entity, target);
    if (targetIndex === -1) {
      throw new Error(
        `Koota: [RELATION_PRESENT] The relation pair was removed during its set callback. Wrap the set in world.defer to apply the removal after the write. Entity ${entity}, target ${target}, trait ${relation[$internal].trait.id}.`
      );
    }
  }

  setPairRecordAt(ctx, entity, relation, targetIndex, value);
  if (triggerChanged) notifyPairChanged(ctx, entity, relation[$internal].trait, target);
}

export /* @inline */ function assertRelationTarget(
  ctx: WorldContext,
  target: unknown
): asserts target is Entity {
  // Liveness in this index also establishes world membership.
  if (typeof target !== 'number' || !isEntityAlive(ctx.entityIndex, target as Entity)) {
    throw createRelationTargetError(ctx, target);
  }
}

export const createRelationTargetError = (ctx: WorldContext, target: unknown): Error => {
  if (typeof target !== 'number') {
    return new Error(
      'Koota: [RELATION_TARGET] Adding or setting a relation requires one entity target. Wildcards and query filters cannot be written.'
    );
  }
  if (ctx.entityIndex.allocator.pageOwners[getEntityId(target as Entity) >>> 10] !== ctx) {
    return new Error(
      `Koota: [RELATION_WORLD] Relation target ${target} must belong to the source world.`
    );
  }
  return createEntityNotAliveError(target as Entity);
};

/** The caller has checked that the pair is absent. Returns the index of the new target. */
export function addRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait)!;
  if (assertsEnabled) assertRelationMembership(ctx, entity, traitData);

  if (!traitData.relationTargets) {
    traitData.relationTargets = [];
  }

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = ensureRelationPage(traitData.relationTargets, p);

  let targetIndex: number;

  if (relationCtx.exclusive) {
    page[o] = target;
    targetIndex = 0;
  } else {
    if (!page[o]) page[o] = [];
    const entityTargets = page[o] as number[];

    targetIndex = entityTargets.length;
    entityTargets.push(target);
  }

  traitData.version++;
  reconcileRelationQueries(ctx, traitData, entity, target, 'add', false);
  addToRelationSources(ctx, traitData, entity, target);

  return targetIndex;
}

/** Update both indexes of a scope edge before publishing the move. */
function commitScopedRelationTarget(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
): Entity | undefined {
  const trait = relation[$internal].trait;
  const data = ctx.traitInstances[trait.id]!;
  const eid = getEntityId(entity);
  const page = ((data.relationTargets ??= [])[eid >>> 10] ??= []);
  const previous = page[eid & 1023] as Entity | undefined;
  if (previous !== undefined) {
    removeFromRelationSources(data, entity, previous, 0);
    clearPairRecords(data, eid, true);
    if (ctx.retain !== 0) recordPairRemoval(ctx, entity, trait.id, previous);
  }
  page[eid & 1023] = target;
  if (target !== undefined) addToRelationSources(ctx, data, entity, target);
  data.version++;
  return previous;
}

/** Returns how many targets remain on the entity, or -1 when the pair was not present. */
export function removeRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const relationTrait = relationCtx.trait;

  const data = getTraitInstance(ctx.traitInstances, relationTrait);
  if (!data || !data.relationTargets) return -1;

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = data.relationTargets[p];
  if (!page) return -1;

  let remaining = 0;

  if (relationCtx.exclusive) {
    if (page[o] !== target) return -1;
    removeFromRelationSources(data, entity, target, 0);
    page[o] = undefined;
    clearPairRecords(data, eid, true);
  } else {
    const entityTargets = page[o] as Entity[] | undefined;
    if (!entityTargets) return -1;
    const idx = entityTargets.indexOf(target);
    if (idx === -1) return -1;
    removeTargetAt(data, entity, eid, entityTargets, idx);
    remaining = entityTargets.length;
  }

  finishPairRemoval(ctx, data, entity, target);
  return remaining;
}

/**
 * Drops the target at an index of an entity's list. The last target moves into the gap, along
 * with its pair data and the slot an indexed relation recorded for it.
 */
/* @inline */
function removeTargetAt(
  data: TraitInstance,
  entity: Entity,
  eid: number,
  targets: Entity[],
  idx: number
): void {
  const lastIdx = targets.length - 1;
  removeFromRelationSources(data, entity, targets[idx], idx);
  if (idx !== lastIdx) targets[idx] = targets[lastIdx];
  targets.pop();
  if (data.relationSlots !== undefined) {
    const slots = data.relationSlots[eid >>> 10][eid & 1023] as number[];
    if (idx !== lastIdx) slots[idx] = slots[lastIdx];
    slots.pop();
  }
  const type = data.trait[$internal].type;
  if (type !== 'tag') removePairRecordAt(data.store, type, eid, idx, lastIdx);
}

/** Records a pair a live entity lost and tells the queries that watch the relation. */
/* @inline */
function finishPairRemoval(
  ctx: WorldContext,
  data: TraitInstance,
  entity: Entity,
  target: Entity
): void {
  data.version++;
  if (ctx.retain !== 0) recordPairRemoval(ctx, entity, data.trait.id, target);
  reconcileRelationQueries(ctx, data, entity, target, 'remove', false);
}

/** Forward edges require base trait membership until their final removal. */
/* @inline */
function assertRelationMembership(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance | undefined
) {
  const eid = getEntityId(entity);
  if (data === undefined || (data.masks[eid >>> 10][(eid & 1023) << 2] & data.bitflag) === 0) {
    throw new Error(
      `Koota: [RELATION_INDEX] Relation targets require their base trait membership. Entity ${entity}, trait ${data?.trait.id}.`
    );
  }
}

/**
 * Remember a pair a live entity lost. A pair has no bit in the removed mask, so the world keeps
 * its newest removals in a ring under the same cap as destroyed entities.
 */
export function recordPairRemoval(
  ctx: WorldContext,
  entity: Entity,
  traitId: number,
  target: Entity
) {
  const ring = ctx.pairRemovals;
  const entries = ring.entries;
  const releases = ctx.entityIndex.releases;
  if (entries.length < ctx.retain * 4) {
    entries.push(entity, traitId, target, releases);
    return;
  }
  const head = ring.head;
  entries[head] = entity;
  entries[head + 1] = traitId;
  entries[head + 2] = target;
  entries[head + 3] = releases;
  ring.head = head + 4 === entries.length ? 0 : head + 4;
}

export function removeAllRelationTargets(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): void {
  const relationCtx = relation[$internal];
  const data = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  const eid = getEntityId(entity);
  const entry = data?.relationTargets?.[eid >>> 10]?.[eid & 1023];
  if (entry === undefined) return;
  if (relationCtx.exclusive) {
    removeRelationTarget(ctx, relation, entity, entry as Entity);
    return;
  }
  const targets = entry as Entity[];
  // The last target leaves each time, so nothing moves and the list needs no copy.
  for (let idx = targets.length - 1; idx >= 0; idx--) {
    const target = targets[idx];
    removeTargetAt(data!, entity, eid, targets, idx);
    finishPairRemoval(ctx, data!, entity, target);
  }
}

/** Eviction releases the targets and records a destroyed source kept for removal queries. */
export function clearRetainedPairs(instance: TraitInstance, eid: number) {
  const exclusive = instance.trait[$internal].relation![$internal].exclusive;
  if (clearRetainedTargets(instance, eid, exclusive)) clearPairRecords(instance, eid, exclusive);
}
