import type { SparseSet } from '@koota/collections';
import { flagTarget } from '../entity/utils/target-flags';
import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import type { Entity } from '../entity/types';
import { moveScopedIdentifiers } from '../identifier/scoped-identifier';
import { getEntityId } from '../entity/utils/pack-entity';
import type { EventType, QueryParameter } from '../query/types';
import {
  addEntityToQuery,
  IsExcluded,
  reconcileAnchoredQueries,
  reconcileTargetQueries,
  removeEntityFromQuery,
} from '../query/query';
import { checkQueryTrackingPair } from '../query/utils/check-query-tracking';
import { checkQueryWithFilters } from '../query/utils/check-query-filters';
import { isStableParameter } from '../query/modifier';
import { isQuery } from '../query/utils/is-query';
import { sameParams } from '../query/utils/same-params';
import { isRequired, pairTraitAccessors, type Schema, type TraitSchema } from '../storage';
import { defineTrait, hasTrait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { RelationSources, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import type { Relation, RelationPair } from './types';
import { $relation, $relationPair } from './symbols';

function ensureRelPage(arr: any[], pageId: number): any[] {
  if (!arr[pageId]) arr[pageId] = [];
  return arr[pageId];
}

type RelationDefinition<S extends TraitSchema> = {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  store?: S;
};

function createRelation<S extends TraitSchema = Record<string, never>>(
  definition: RelationDefinition<S> & { exclusive: true }
): Relation<Trait<S>, true>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S> & { exclusive?: false }
): Relation<Trait<S>, false>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S>
): Relation<Trait<S>>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S>
): Relation<Trait<S>> {
  const relationTrait = defineTrait(
    definition?.store ?? ({} as S),
    'relation',
    pairTraitAccessors
  ) as unknown as Trait<S>;
  const traitCtx = relationTrait[$internal];

  let autoDestroy: 'source' | 'target' | false = false;
  if (definition?.autoDestroy === 'orphan' || definition?.autoDestroy === 'source') {
    autoDestroy = 'source';
  } else if (definition?.autoDestroy === 'target') {
    autoDestroy = 'target';
  }

  if (definition?.autoRemoveTarget) {
    console.warn("Koota: 'autoRemoveTarget' is deprecated. Use 'autoDestroy: \"orphan\"' instead.");
    autoDestroy = 'source';
  }

  const relationCtx = {
    trait: relationTrait,
    exclusive: definition?.exclusive ?? false,
    autoDestroy,
    scopedIdentifiers: undefined,
  };

  // A wildcard pair holds nothing of its own, so every call returns this one.
  const wildcard: RelationPair<Trait<S>> = {
    [$relationPair]: true,
    relation: relationFn as unknown as Relation<Trait<S>>,
    target: '*',
    params: undefined,
  };

  // Pairs whose target query is the same objects on every call, listed under its first entry.
  const targetQueryPairs = new WeakMap<object, RelationPair<Trait<S>>[]>();

  function relationFn(...args: any[]): RelationPair<Trait<S>> {
    const firstArg = args[0];
    if (firstArg === '*') return wildcard;

    if (typeof firstArg === 'number') {
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        target: firstArg as Entity,
        params: args[1],
      };
    }

    if (firstArg === undefined) throw Error('Relation target is undefined');

    const shared = targetQueryPairs.get(firstArg);
    if (shared !== undefined) {
      for (let i = 0; i < shared.length; i++) {
        const targetQuery = shared[i].targetQuery!;
        // A query ref is the whole target. Inline parameters are compared entry by entry.
        if (
          targetQuery === firstArg
            ? args.length === 1
            : sameParams(targetQuery as readonly QueryParameter[], args)
        ) {
          return shared[i];
        }
      }
    }

    if (isQuery(firstArg) && args.length > 1) {
      throw Error('Query relations do not accept additional parameters.');
    }
    const pair: RelationPair<Trait<S>> = {
      [$relationPair]: true,
      relation: relationFn as unknown as Relation<Trait<S>>,
      targetQuery: isQuery(firstArg) ? firstArg : (args as QueryParameter[]),
    };
    if (isStableParameter(pair)) {
      if (shared === undefined) targetQueryPairs.set(firstArg, [pair]);
      else shared.push(pair);
    }
    return pair;
  }

  const relation = Object.assign(relationFn, {
    [$internal]: relationCtx,
  }) as Relation<Trait<S>>;

  Object.defineProperty(relation, $relation, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // Pairs share the relation's data trait, so its records fit every target.
  Object.defineProperty(relation, 'record', {
    value: relationTrait.record,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  traitCtx.relation = relation;

  return relation;
}

export const relation = createRelation;

const EMPTY_ENTITY_ARRAY: readonly Entity[] = Object.freeze([]) as readonly Entity[];

/**
 * Appends the entity to the sources of a target. The target is already in the entity's own list.
 *
 * A relation starts out unindexed, and a source is found in a bucket by scanning it. Once a large
 * bucket needs a scan the relation is indexed for good. relationSlots then records where each
 * entity sits in the bucket of every target it holds, so a removal needs no search.
 */
function addToRelationSources(
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
  const page = ensureRelPage(traitData.relationSlots!, eid >>> 10);
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
function removeFromRelationSources(
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

/**
 * Drops the targets and pair data a destroyed entity kept. Runs when it is evicted. Target
 * lists are emptied in place, as a removal would, so the next pair reuses them.
 */
export function clearRelationEntity(instance: TraitInstance, eid: number): void {
  const p = eid >>> 10;
  const o = eid & 1023;
  const page = instance.relationTargets![p];
  if (page === undefined) return;
  const entry = page[o];
  if (entry === undefined) return;
  const traitCtx = instance.trait[$internal];
  const exclusive = traitCtx.relation![$internal].exclusive;
  if (exclusive) page[o] = undefined;
  else {
    popAll(entry as unknown[]);
    popAll(instance.relationSlots?.[p]?.[o]);
  }
  if (traitCtx.type === 'tag') return;
  const store = instance.store as any;
  if (traitCtx.type === 'aos') {
    const slots = store[p];
    if (slots === undefined) return;
    if (exclusive) slots[o] = undefined;
    else popAll(slots[o]);
    return;
  }
  for (const key in store) {
    const slots = store[key][p];
    if (slots === undefined) continue;
    if (exclusive) slots[o] = undefined;
    else popAll(slots[o]);
  }
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

  const relationCtx = relation[$internal];

  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData || !traitData.relationTargets) return undefined;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return undefined;

  if (relationCtx.exclusive) {
    return page[eid & 1023] as Entity | undefined;
  } else {
    return (page[eid & 1023] as number[] | undefined)?.[0] as Entity | undefined;
  }
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
  const page = ensureRelPage(traitData.relationTargets, p);

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

/** Commit the forward edge, reverse edge and names before any query or subscriber runs. */
export function commitScopedRelationTarget(
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
    clearRelationDataInternal(data.store, trait[$internal].type, eid, 0, true);
    if (ctx.retain !== 0) recordPairRemoval(ctx, entity, trait.id, previous);
  }
  page[eid & 1023] = target;
  if (target !== undefined) addToRelationSources(ctx, data, entity, target);
  moveScopedIdentifiers(ctx, relation, entity, target);
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
    clearRelationDataInternal(data.store, relationTrait[$internal].type, eid, 0, true);
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
/* @inline */ function removeTargetAt(
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
  if (type !== 'tag') swapAndPopRelationData(data.store, type, eid, idx, lastIdx);
}

/** Records a pair a live entity lost and tells the queries that watch the relation. */
/* @inline */ function finishPairRemoval(
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
/* @inline */ function assertRelationMembership(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance | undefined
) {
  const eid = getEntityId(entity);
  if (
    data === undefined ||
    (ctx.entityMasks[data.generationId][eid >>> 10][(eid & 1023) << 2] & data.bitflag) === 0
  ) {
    throw new Error(
      `Koota: [RELATION_INDEX] Relation targets require their base trait membership. Entity ${entity}, trait ${data?.trait.id}.`
    );
  }
}

/**
 * Remember a pair a live entity lost. A pair has no bit in the removed mask, so the world keeps
 * its newest removals in a ring under the same cap as destroyed entities.
 */
function recordPairRemoval(ctx: WorldContext, entity: Entity, traitId: number, target: Entity) {
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

/**
 * Re-evaluate the queries that filter on or track the pairs of a relation after a pair event. A
 * pair write or a dying entity leaves static membership alone and only concerns tracking queries.
 */
export /* @inline */ function reconcileRelationQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity,
  target: Entity,
  eventType: EventType,
  trackingOnly: boolean
): void {
  // Most relations have no such query, so the check stays with the caller and the work is a call.
  if (
    instance.relationQueries.length !== 0 ||
    instance.anchorRelations.length !== 0 ||
    instance.relationQueryIdentifiers !== undefined
  ) {
    reconcilePairQueries(ctx, instance, entity, target, eventType, trackingOnly);
  }
}

/** Exported so the inline guard in reconcileRelationQueries can expand in other modules. */
export function reconcilePairQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity,
  target: Entity,
  eventType: EventType,
  trackingOnly: boolean
): void {
  if (!trackingOnly && instance.anchorRelations.length !== 0) {
    // The entity no longer lists a target it lost, so the queries of that target are named here.
    if (eventType === 'remove') reconcileTargetQueries(ctx, entity, target, false);
    reconcileAnchoredQueries(ctx, entity, instance, false);
  }
  const queries = instance.relationQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let match: boolean;
    if (query.isTracking) {
      match = checkQueryTrackingPair(ctx, query, entity, instance.trait.id, target, eventType);
    } else if (trackingOnly) {
      continue;
    } else {
      match = checkQueryWithFilters(ctx, query, entity);
    }
    if (match) {
      addEntityToQuery(query, entity);
    } else {
      removeEntityFromQuery(query, entity);
    }
  }
  if (!trackingOnly && instance.relationQueryIdentifiers !== undefined) {
    reconcileIdentifiedRelationQueries(ctx, instance, entity);
  }
}

/** A required local key rules out relation queries for every other name. */
function reconcileIdentifiedRelationQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity
) {
  const eid = getEntityId(entity);
  for (const identifier of instance.relationQueryIdentifiers!) {
    const index = ctx.traitInstances[identifier.id]?.identifier;
    const key = index?.targets[eid >>> 10]?.[eid & 1023];
    if (key === undefined) continue;
    const queries = index!.queries.get(key);
    if (queries === undefined) continue;
    for (const query of queries) {
      const first = query.identifierFilters![0];
      if (first.identifier !== identifier || first.target !== key) continue;
      const pairs = query.filters?.pairs;
      if (pairs === undefined) continue;
      let required = false;
      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].term === 1 && pairs[i].relation[$internal].trait === instance.trait) {
          required = true;
          break;
        }
      }
      if (!required) continue;
      if (checkQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(query, entity);
    }
  }
}

function swapAndPopRelationData(
  store: any,
  type: string,
  eid: number,
  idx: number,
  lastIdx: number
): void {
  const p = eid >>> 10,
    o = eid & 1023;
  if (type === 'aos') {
    const arr = store[p]?.[o];
    if (arr) {
      if (idx !== lastIdx) arr[idx] = arr[lastIdx];
      arr.pop();
    }
  } else {
    for (const key in store) {
      const arr = store[key][p]?.[o];
      if (arr) {
        if (idx !== lastIdx) arr[idx] = arr[lastIdx];
        arr.pop();
      }
    }
  }
}

function clearRelationDataInternal(
  store: any,
  type: string,
  eid: number,
  _idx: number,
  exclusive: boolean
): void {
  if (!exclusive || type === 'tag') return;
  const p = eid >>> 10,
    o = eid & 1023;
  if (type === 'aos') {
    if (store[p]) store[p][o] = undefined;
  } else {
    for (const key in store) {
      if (store[key][p]) store[key][p][o] = undefined;
    }
  }
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

function getRelationSourceBucket(ctx: WorldContext, relation: Relation<Trait>, target: Entity) {
  const traitData = getTraitInstance(ctx.traitInstances, relation[$internal].trait);
  const bucket = traitData?.relationSourcesByTarget?.[getEntityId(target)];
  if (bucket?.target === target) return bucket;
}

/**
 * The entities that hold a relation to a target, as the reverse index stores them. A walk runs
 * inside a defer scope, so the list holds still while hooks run. Copy it to keep it.
 */
export function getEntitiesWithRelationTo(
  ctx: WorldContext,
  relation: Relation<Trait>,
  target: Entity
): readonly Entity[] {
  return getRelationSourceBucket(ctx, relation, target) ?? EMPTY_ENTITY_ARRAY;
}

/** A one-off first match can stop at the first visible source in the query's seed order. */
export function getFirstEntityWithRelationTo(
  ctx: WorldContext,
  relation: Relation<Trait>,
  target: Entity
) {
  const bucket = getRelationSourceBucket(ctx, relation, target);
  if (bucket === undefined) return;
  for (let i = 0; i < bucket.length; i++) {
    if (!hasTrait(ctx, bucket[i], IsExcluded)) return bucket[i];
  }
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

export function setRelationDataAtIndex(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  targetIndex: number,
  value: Record<string, unknown>
): void {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return;
  traitData.version++;

  const store = traitData.store;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;

  if (baseTrait[$internal].type === 'aos') {
    const page = ensureRelPage(store as any[], p);
    if (relationCtx.exclusive) {
      page[o] = value;
    } else {
      (page[o] ??= [])[targetIndex] = value;
    }
    return;
  }

  const storeRec = store as Record<string, any[]>;
  const schema = traitData.schema as Record<string, unknown>;
  const exclusive = relationCtx.exclusive;
  for (const key in value) {
    writeRelationField(storeRec, schema, key, value[key], exclusive, p, o, targetIndex);
  }
}

/** Writes one field of a pair record. Tuples copy into the array the pair already holds. */
function writeRelationField(
  store: Record<string, any[]>,
  schema: Record<string, unknown>,
  key: string,
  field: unknown,
  exclusive: boolean,
  p: number,
  o: number,
  targetIndex: number
) {
  const kPage = ensureRelPage(store[key], p);
  const slots: unknown[] = exclusive ? kPage : (kPage[o] ??= []);
  const slot = exclusive ? o : targetIndex;
  if (!Array.isArray(schema[key])) {
    slots[slot] = field;
    return;
  }
  // Each pair keeps one array per tuple. Writes copy into it, so it never aliases the caller's array.
  const stored = slots[slot] as unknown[] | undefined;
  if (stored === undefined) slots[slot] = Array.from(field as ArrayLike<unknown>);
  else for (let i = 0; i < stored.length; i++) stored[i] = (field as ArrayLike<unknown>)[i];
}

/**
 * Asserts that params carry every value the store requires by calling the marker of a missing
 * one. Runs before the pair is granted, so a failed add leaves the entity without the pair.
 */
export function assertRequiredParams(
  schema: Schema,
  params: Record<string, unknown> | undefined
): void {
  // A required store is the marker itself.
  if (typeof schema === 'function') {
    if (params === undefined) schema();
    return;
  }
  const fields = schema as Record<string, unknown>;
  for (const key in fields) {
    if (isRequired(fields[key]) && (params === undefined || !(key in params))) {
      (fields[key] as () => void)();
    }
  }
}

/**
 * Fills a new pair's record from the schema defaults and the given params. SoA fields are
 * resolved one at a time so no defaults object is built. Tag relations store nothing.
 */
export function initRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  traitData: TraitInstance,
  targetIndex: number,
  params: Record<string, unknown> | undefined
): void {
  const traitCtx = traitData.trait[$internal];
  const type = traitCtx.type;
  if (type === 'tag') return;
  if (type === 'aos') {
    // An AoS record is fresh per pair, so the params are laid over the factory result.
    // A required store has no factory result, so the params are the record.
    let record = params;
    if (!traitCtx.required) {
      record = (traitData.schema as () => Record<string, unknown>)();
      if (params !== undefined) Object.assign(record, params);
    }
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, record!);
    return;
  }

  traitData.version++;
  const store = traitData.store as Record<string, any[]>;
  const schema = traitData.schema as Record<string, unknown>;
  const exclusive = relation[$internal].exclusive;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  for (const key in schema) {
    let field: unknown;
    if (params !== undefined && key in params) field = params[key];
    else if (typeof schema[key] === 'function') field = (schema[key] as () => unknown)();
    else field = schema[key];
    writeRelationField(store, schema, key, field, exclusive, p, o, targetIndex);
  }
}

export function setRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  value: Record<string, unknown>
): void {
  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return;
  setRelationDataAtIndex(ctx, entity, relation, targetIndex, value);
}

export function getRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  out?: Record<string, unknown>
): unknown {
  const baseTrait = relation[$internal].trait;
  const traitCtx = baseTrait[$internal];
  // A relation without a store is a tag underneath, so its pairs have no record.
  if (traitCtx.type === 'tag') return undefined;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return undefined;

  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return undefined;

  const store = traitData.store;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const relationCtx = relation[$internal];

  if (traitCtx.type === 'aos') {
    const page = (store as any[])[p];
    if (!page) return undefined;
    if (relationCtx.exclusive) {
      return page[o];
    } else {
      return page[o]?.[targetIndex];
    }
  } else {
    const result: Record<string, unknown> = out ?? {};
    const storeRecord = store as Record<string, any[]>;
    const schema = traitData.schema as Record<string, unknown>;
    for (const key in storeRecord) {
      const kPage = storeRecord[key][p];
      if (!kPage) continue;
      const field = relationCtx.exclusive
        ? kPage[o]
        : (kPage[o] as unknown[] | undefined)?.[targetIndex];
      if (!Array.isArray(schema[key])) {
        result[key] = field;
      } else if (out) {
        // With out, tuples are copied into the arrays it already holds.
        const into = out[key] as unknown[];
        for (let i = 0; i < into.length; i++) into[i] = (field as unknown[])[i];
      } else {
        result[key] = (field as unknown[]).slice();
      }
    }
    return result;
  }
}

/**
 * Check if an entity has a concrete relation pair (specific target or wildcard).
 * Target slots cover live pairs and pairs retained for Removed query filters.
 * Does NOT handle targetQuery — that is resolved by the query layer or entity convenience methods.
 */
export /* @inline @pure */ function hasRelationPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair
): boolean {
  const target = pair.target;
  if (target === undefined) return false;
  const relationCtx = pair.relation[$internal];
  const instance = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  const eid = getEntityId(entity);
  const targets = instance?.relationTargets?.[eid >>> 10]?.[eid & 1023];
  if (targets === undefined) return false;
  return relationCtx.exclusive
    ? target === '*' || targets === target
    : target === '*'
      ? targets.length !== 0
      : targets.includes(target);
}
