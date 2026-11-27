import type { SparseSet } from '@koota/collections';
import { assertsEnabled } from '../build-flags';
import { assertEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { getTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { flagTarget } from './cascade';
import { firstTargetInPages, hasTargetInPages } from './target-pages';
import type { Relation, RelationPair, RelationSources } from './types';

export /* @inline @pure */ function getExclusiveTarget(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity
): Entity | undefined {
  const eid = getEntityId(entity);
  return ctx.traitInstances[relation[$internal].trait.id]?.relationTargets?.[eid >>> 10]?.[
    eid & 1023
  ] as Entity | undefined;
}

export function ensureRelationPage(arr: any[], pageId: number): any[] {
  if (!arr[pageId]) arr[pageId] = [];
  return arr[pageId];
}

const EMPTY_ENTITY_ARRAY: readonly Entity[] = Object.freeze([]) as readonly Entity[];

/**
 * Appends the entity to the sources of a target. The target is already in the entity's own list.
 *
 * A relation starts out unindexed, and a source is found in a bucket by scanning it. Once a large
 * bucket needs a scan the relation is indexed for good. relationSlots then records where each
 * entity sits in the bucket of every target it holds, so a removal needs no search.
 */
export function addToRelationSources(
  ctx: WorldContext,
  traitData: TraitInstance,
  entity: Entity,
  target: Entity
): void {
  const targetId = getEntityId(target);
  const buckets = (traitData.relationSourcesByTarget ??= []);
  let bucket = buckets[targetId];
  if (bucket === undefined) {
    // A bucket outlives its entity, so the id keeps the flag that sends destroy to its sources.
    bucket = buckets[targetId] = [];
    flagTarget(ctx, targetId);
  }
  bucket.target = target;
  bucket.push(entity);
  if (traitData.relationSlots !== undefined) {
    recordRelationSlot(traitData, entity, target, bucket.length - 1);
  }
}

/** Records where an entity sits in the bucket of a target it holds. */
function recordRelationSlot(
  traitData: TraitInstance,
  entity: Entity,
  target: Entity,
  slot: number
): void {
  const eid = getEntityId(entity);
  const held = traitData.relationTargets![eid >>> 10][eid & 1023];
  const page = ensureRelationPage(traitData.relationSlots!, eid >>> 10);
  // An exclusive relation keeps one target per entity and any other a list of them. A target
  // that was just added is the last of its list, so the search starts there.
  if (typeof held === 'number') page[eid & 1023] = slot;
  else (page[eid & 1023] ??= [])[(held as Entity[]).lastIndexOf(target)] = slot;
}

/** Indexes every pair of a relation. Runs once, when a large bucket first needs a scan. */
function indexRelationSources(traitData: TraitInstance): void {
  traitData.relationSlots = [];
  const buckets = traitData.relationSourcesByTarget!;
  // Buckets are keyed by target id, so the list has a hole for every entity that was never one.
  for (let targetId = 0; targetId < buckets.length; targetId++) {
    const bucket = buckets[targetId];
    if (bucket === undefined) continue;
    for (let slot = 0; slot < bucket.length; slot++) {
      recordRelationSlot(traitData, bucket[slot], bucket.target!, slot);
    }
  }
}

/**
 * The slot an indexed relation recorded for an entity under the target at an index of its list,
 * or -1 when the entity no longer sits there. Indexes the relation on first use.
 */
function findRelationSlot(
  traitData: TraitInstance,
  bucket: RelationSources,
  entity: Entity,
  targetIndex: number
): number {
  if (traitData.relationSlots === undefined) indexRelationSources(traitData);
  const eid = getEntityId(entity);
  const held = traitData.relationSlots![eid >>> 10]?.[eid & 1023];
  const slot: number | undefined = typeof held === 'number' ? held : held?.[targetIndex];
  return slot !== undefined && bucket[slot] === entity ? slot : -1;
}

/**
 * Takes the entity out of the sources of a target. `targetIndex` is where the target sits in the
 * entity's own list. The last source moves into the gap.
 */
export function removeFromRelationSources(
  traitData: TraitInstance,
  entity: Entity,
  target: Entity,
  targetIndex: number
): void {
  const bucket: RelationSources =
    traitData.relationSourcesByTarget?.[getEntityId(target)] ?? (EMPTY_ENTITY_ARRAY as Entity[]);
  const last = bucket.length - 1;
  let slot: number;
  // A dying target walks its sources from the end, so the last slot is checked first.
  if (bucket[last] === entity) slot = last;
  else if (traitData.relationSlots === undefined && last < 64) slot = bucket.indexOf(entity);
  else slot = findRelationSlot(traitData, bucket, entity, targetIndex);
  if (slot === -1) {
    if (assertsEnabled) {
      throw new Error(
        `Koota: [RELATION_INDEX] A forward relation is missing its reverse source. Entity ${entity}, target ${target}, trait ${traitData.trait.id}.`
      );
    }
    return;
  }
  if (slot !== last) {
    const moved = bucket[last];
    bucket[slot] = moved;
    if (traitData.relationSlots !== undefined) recordRelationSlot(traitData, moved, target, slot);
  }
  bucket.pop();
}

/**
 * A destroyed entity keeps its targets and pair data until eviction, so only the reverse
 * index, which lives on the targets, lets go of it.
 */
export function detachRelationTargets(instance: TraitInstance, entity: Entity): void {
  const eid = getEntityId(entity);
  const entry = instance.relationTargets?.[eid >>> 10]?.[eid & 1023];
  if (entry === undefined) return;
  if (typeof entry === 'number') {
    removeFromRelationSources(instance, entity, entry as Entity, 0);
  } else {
    const targets = entry as Entity[];
    for (let i = 0; i < targets.length; i++) {
      removeFromRelationSources(instance, entity, targets[i], i);
    }
  }
  instance.version++;
}

/** Clear the forward targets and their index slots when a retained source is evicted. */
export function clearRetainedTargets(
  instance: TraitInstance,
  eid: number,
  exclusive: boolean
): boolean {
  const p = eid >>> 10;
  const o = eid & 1023;
  const page = instance.relationTargets![p];
  const entry = page?.[o];
  if (entry === undefined) return false;
  if (exclusive) page[o] = undefined;
  else {
    popAll(entry);
    popAll(instance.relationSlots?.[p]?.[o]);
  }
  return true;
}

function popAll(list: unknown[] | undefined) {
  if (list === undefined) return;
  while (list.length !== 0) list.pop();
}

/**
 * Get the targets for a relation on an entity.
 * Returns an array of target entity IDs.
 */
export /* @inline */ function getRelationTargets(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): readonly Entity[] {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  const relationCtx = relation[$internal];

  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData || !traitData.relationTargets) return [];

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = traitData.relationTargets[p];
  if (!page) return [];

  if (relationCtx.exclusive) {
    const target = page[o] as Entity | undefined;
    return target !== undefined ? [target] : [];
  } else {
    const targets = page[o] as number[] | undefined;
    return targets !== undefined ? (targets.slice() as Entity[]) : [];
  }
}

/**
 * The targets an entity holds, as the relation stores them. A dying entity keeps them until it is
 * evicted. An exclusive relation stores one target, which gets a list of its own.
 */
export function getStoredRelationTargets(instance: TraitInstance, entity: Entity): readonly Entity[] {
  const eid = getEntityId(entity);
  const entry = instance.relationTargets?.[eid >>> 10]?.[eid & 1023];
  if (entry === undefined) return EMPTY_ENTITY_ARRAY;
  return typeof entry === 'number' ? [entry as Entity] : (entry as Entity[]);
}

export /* @inline */ function getFirstRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): Entity | undefined {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  const instance = getTraitInstance(ctx.traitInstances, relation[$internal].trait);
  return firstTargetInPages(instance?.relationTargets, entity);
}

export /* @inline @pure */ function getTargetIndex(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData || !traitData.relationTargets) return -1;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return -1;

  if (relationCtx.exclusive) {
    return page[eid & 1023] === target ? 0 : -1;
  } else {
    const targets = page[eid & 1023] as number[] | undefined;
    return targets ? targets.indexOf(target) : -1;
  }
}

export /* @inline @pure */ function hasRelationToTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): boolean {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData || !traitData.relationTargets) return false;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return false;

  if (relationCtx.exclusive) {
    return page[eid & 1023] === target;
  } else {
    const targets = page[eid & 1023] as number[] | undefined;
    return targets ? targets.includes(target) : false;
  }
}

function getRelationSourceBucket(ctx: WorldContext, relation: Relation<Trait>, target: Entity) {
  const traitData = getTraitInstance(ctx.traitInstances, relation[$internal].trait);
  const bucket = traitData?.relationSourcesByTarget?.[getEntityId(target)];
  if (bucket?.target === target) return bucket;
}

/**
 * The entities that hold a relation to a target, as the reverse index stores them. A walk runs
 * inside a defer scope, so the list holds still while hooks run. Copy it to keep it.
 */
export function getRelationSources(
  ctx: WorldContext,
  relation: Relation<Trait>,
  target: Entity
): readonly Entity[] {
  return getRelationSourceBucket(ctx, relation, target) ?? EMPTY_ENTITY_ARRAY;
}

export function hasRelationTargetInSet(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  matches: SparseSet
): boolean {
  const relationCtx = relation[$internal];
  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData?.relationTargets) return false;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return false;

  if (relationCtx.exclusive) {
    const target = page[eid & 1023] as Entity | undefined;
    return target !== undefined && matches.has(target);
  }

  const targets = page[eid & 1023] as number[] | undefined;
  if (!targets) return false;

  for (let i = 0; i < targets.length; i++) {
    if (matches.has(targets[i]!)) return true;
  }

  return false;
}

/**
 * Check if an entity has a concrete relation pair (specific target or wildcard).
 * Target slots cover live pairs and pairs retained for Removed query filters.
 * Does not handle targetQuery. The query layer and the trait ops resolve that.
 */
export /* @inline @pure */ function hasRelationPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair
): boolean {
  const target = pair.target;
  if (target === undefined) return false;
  const instance = getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait);
  return hasTargetInPages(instance?.relationTargets, entity, target);
}
