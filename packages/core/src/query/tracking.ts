import { isEntityAlive, isEntityReadable } from '../entity/entity-index';
import { GENERATION_MASK, getEntityId, PAGE_SIZE } from '../entity/handle';
import { growPageTable } from '../entity/page-table';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { hasRelationToTarget } from '../relation/targets';
import { PENDING_WORD, REMOVED_WORD } from '../trait/mask-table';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import {
  hasFilterPair,
  matchesIdentifiers,
  matchesStaticMasks,
  matchesQueryFilters,
} from './matching';
import {
  addEntityToQuery,
  detachWalkedSet,
  exposeQuerySet,
  removeEntityFromQuery,
} from './membership';
import type { EventType, QueryInstance, ResolvedRelationFilter } from './types';

/**
 * Exposes the batch accumulated since the previous run and starts collecting the next one in the
 * set that run exposed. A run nested inside a walk of the batch keeps it as it is. For Removed
 * queries, both batches can read destroyed entities until the world's retention cap evicts them.
 * Static alternatives in a mixed or query carry their live matches into the next batch.
 */
export function consumeTrackingBatch(query: QueryInstance) {
  if (query.iterating !== 0) return;
  if (query.readers !== 0) detachWalkedSet(query);
  const exposed = query.entities;
  const next = query.exposed;
  next.clear();
  query.entities = next;
  exposeQuerySet(query, exposed);
  const { dense, length } = exposed;
  for (let i = 0; i < length; i++) {
    resetQueryTrackingBitmasks(query, getEntityId(dense[i] as Entity));
  }
  if (query.filters?.tracking === 'or') {
    // Pending matches already satisfy the mandatory terms. Carry forward their static alternatives.
    for (let i = 0; i < length; i++) {
      const entity = dense[i] as Entity;
      if (matchesQueryFilters(query.ctx, query, entity)) next.add(entity);
    }
  }
}

export function resetQueryTrackingBitmasks(query: QueryInstance, eid: number) {
  const groups = query.trackingGroups;
  const len = groups.length;
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  for (let i = 0; i < len; i++) {
    const trackers = groups[i].trackers;
    const trackersLen = trackers.length;
    for (let j = 0; j < trackersLen; j++) {
      if (!trackers[j]) continue;
      const page = trackers[j][pageId];
      if (page !== EMPTY_TRACKER_PAGE) page[offset] = 0;
    }
  }
}

export function checkQueryTracking(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  eventType: EventType,
  eventGenerationId: number,
  eventBitflag: number
): boolean {
  if (
    query.identifierFilters !== undefined &&
    !matchesIdentifiers(ctx, entity, query.identifierFilters)
  ) {
    return false;
  }

  const trackingGroups = query.trackingGroups;
  const entityMasks = ctx.entityMasks;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;

  const trackingGroupsLen = trackingGroups.length;

  if (query.traitInstances.length === 0) return false;

  let hasOrGroup = false;
  let anyOrMatched = false;
  // Every group records the event before the match is decided, so group order cannot drop one.
  let matched = true;

  for (let i = 0; i < trackingGroupsLen; i++) {
    const group = trackingGroups[i];
    const groupType = group.type;
    const groupLogic = group.logic;
    const groupBitmasks = group.bitmasks;
    const groupBitmask = groupBitmasks[eventGenerationId];

    if (groupBitmask && groupBitmask & eventBitflag && group.pairs === null) {
      // The event undoes this group's term, so the recorded hit is taken back and a later recheck
      // cannot report it. Later groups still need to record the event.
      if (
        eventType === 'remove'
          ? groupType !== 'remove'
          : eventType === 'add' && groupType === 'remove'
      ) {
        clearTrackerHit(group.trackers, eventGenerationId, eid, eventBitflag);
        // An and group cannot match without the event. An or group may still hold another term.
        if (groupLogic === 'and') {
          if (i === trackingGroupsLen - 1) return false;
          matched = false;
        }
      }

      if (groupType === eventType || (groupType === 'change' && eventType === 'add')) {
        if (
          eventType === 'change' &&
          !(entityMasks[eventGenerationId][pageId][slot] & eventBitflag)
        ) {
          return false;
        }
        recordTrackerHit(group.trackers, eventGenerationId, eid, eventBitflag);
      }
    }

    if (groupLogic === 'or') {
      hasOrGroup = true;
      if (!anyOrMatched && matchesAnyTracker(group.trackers, groupBitmasks, eid)) anyOrMatched = true;
    } else if (matched && !matchesAllTrackers(group.trackers, groupBitmasks, eid)) {
      matched = false;
    }
  }

  if (!matched || (hasOrGroup && !anyOrMatched && !query.filters?.tracking)) {
    return false;
  }

  return (
    matchesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains) &&
    (query.filters === null || matchesQueryFilters(ctx, query, entity, anyOrMatched))
  );
}

/**
 * Seed Added and Changed from current membership. Removed reads losses the entity has not
 * undone, including every trait it held when destroyed.
 */
export function checkQueryTrackingSeed(ctx: WorldContext, query: QueryInstance, entity: Entity) {
  if (query.traitInstances.length === 0) return false;
  const eid = getEntityId(entity);
  const entityMasks = ctx.entityMasks;
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  if (!matchesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains)) {
    return false;
  }

  const trackingGroups = query.trackingGroups;
  let hasOrGroup = false;
  let anyOrMatched = false;
  let matched = true;

  for (let i = 0; i < trackingGroups.length; i++) {
    const group = trackingGroups[i];
    const bitmasks = group.bitmasks;
    const removed = group.type === 'remove';

    const pairs = group.pairs;
    if (pairs === null) {
      for (let genId = 0; genId < bitmasks.length; genId++) {
        const mask = bitmasks[genId];
        if (!mask) continue;
        const page = entityMasks[genId][pageId];
        const held = page[slot];
        const hits = (removed ? page[slot + REMOVED_WORD] & ~held : held) & mask;
        if (hits !== 0) recordTrackerHit(group.trackers, genId, eid, hits);
      }
    } else if (removed !== isEntityAlive(ctx.entityIndex, entity)) {
      // Removed seeds from the pairs a dead entity kept. Pairs lost alive come from the world's ring.
      for (let p = 0; p < pairs.length; p++) {
        if (hasFilterPair(ctx, entity, pairs[p])) recordTrackerHit(group.trackers, 0, eid, 1 << p);
      }
    }

    if (group.logic === 'or') {
      hasOrGroup = true;
      if (!anyOrMatched && matchesAnyTracker(group.trackers, bitmasks, eid)) anyOrMatched = true;
    } else if (matched && !matchesAllTrackers(group.trackers, bitmasks, eid)) {
      matched = false;
    }
  }

  if (!matched || (hasOrGroup && !anyOrMatched && !query.filters?.tracking)) return false;
  return query.filters === null || matchesQueryFilters(ctx, query, entity, anyOrMatched);
}

/**
 * Record a write in the Changed groups that track the trait, then report whether the tracking
 * groups are satisfied. Every and group must have fired in full and, when or groups exist, at
 * least one of them in part.
 */
function recordChangeAndMatch(
  query: QueryInstance,
  generationId: number,
  eid: number,
  bitflag: number
): boolean {
  const trackingGroups = query.trackingGroups;
  let hasOrGroup = false;
  let anyOrMatched = false;
  let matched = true;
  for (let i = 0; i < trackingGroups.length; i++) {
    const group = trackingGroups[i];
    const bitmasks = group.bitmasks;
    const hit =
      group.type === 'change' && (bitmasks[generationId]! & bitflag) !== 0 && group.pairs === null;
    if (hit) recordTrackerHit(group.trackers, generationId, eid, bitflag);
    if (group.logic === 'or') {
      hasOrGroup = true;
      if (!anyOrMatched && (hit || matchesAnyTracker(group.trackers, bitmasks, eid))) {
        anyOrMatched = true;
      }
    } else if (
      matched &&
      !(hit && group.single) &&
      !matchesAllTrackers(group.trackers, bitmasks, eid)
    ) {
      matched = false;
    }
  }
  return matched && (!hasOrGroup || anyOrMatched);
}

/**
 * Seeds Removed pair terms from the pairs live entities lost before the query existed. An entry
 * counts while its entity is still readable, has not taken the pair back and passes the static
 * terms, as a trait seed does.
 */
export function seedPairRemovals(ctx: WorldContext, query: QueryInstance) {
  const groups = query.trackingGroups;
  const entries = ctx.pairRemovals.entries;
  // An id is destroyed at most once per retain destroys, so its generation cannot wrap sooner.
  const oldest = ctx.entityIndex.releases - (GENERATION_MASK + 1) * ctx.retain;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const pairs = group.pairs;
    if (pairs === null || group.type !== 'remove') continue;

    for (let i = 0; i < entries.length; i += 4) {
      if (entries[i + 3] <= oldest) continue;
      const entity = entries[i] as Entity;
      const target = entries[i + 2] as Entity;
      const eid = getEntityId(entity);

      for (let p = 0; p < pairs.length; p++) {
        const pair = pairs[p];
        if (
          coversPair(pair, entries[i + 1], target) &&
          isEntityReadable(ctx.entityIndex, entity) &&
          !hasRelationToTarget(ctx, pair.relation, entity, target) &&
          matchesStaticBitmasks(query.masks, ctx.entityMasks, eid >>> 10, (eid & 1023) << 2, true)
        ) {
          recordTrackerHit(group.trackers, 0, eid, 1 << p);
        }
      }
    }
  }
}

/**
 * Records a pair event on the pair terms it concerns, then rechecks the query. The opposite event
 * takes a recorded one back, so a pair added and removed between two runs is reported by neither
 * Added nor Removed. A pair change is not a trait event, so the recheck records nothing else.
 */
export function checkQueryTrackingPair(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  traitId: number,
  target: Entity,
  eventType: EventType
): boolean {
  const groups = query.trackingGroups;
  const eid = getEntityId(entity);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const pairs = group.pairs;
    if (pairs === null) continue;
    const type = group.type;

    for (let p = 0; p < pairs.length; p++) {
      if (!coversPair(pairs[p], traitId, target)) continue;

      if (type === eventType || (type === 'change' && eventType === 'add')) {
        recordTrackerHit(group.trackers, 0, eid, 1 << p);
      } else if (eventType !== 'change') {
        clearTrackerHit(group.trackers, 0, eid, 1 << p);
      }
    }
  }

  return checkQueryTracking(ctx, query, entity, 'change', 0, 0);
}

/**
 * A target entering or leaving the filter of a tracked pair adds or removes that pair for each of
 * its sources. The event is recorded on that term alone, since another term of the same relation
 * has its own filter, and then the query is rechecked.
 */
export function checkQueryTrackingFilter(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  filter: ResolvedRelationFilter,
  eventType: 'add' | 'remove'
): boolean {
  const groups = query.trackingGroups;
  const eid = getEntityId(entity);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const p = group.pairs === null ? -1 : group.pairs.indexOf(filter);
    if (p === -1) continue;
    const type = group.type;
    if (type === eventType || (type === 'change' && eventType === 'add')) {
      recordTrackerHit(group.trackers, 0, eid, 1 << p);
    } else {
      clearTrackerHit(group.trackers, 0, eid, 1 << p);
    }
  }

  return checkQueryTracking(ctx, query, entity, 'change', 0, 0);
}

/** The tracked pair is this relation with this target, or with a target its target query matches. */
function coversPair(pair: ResolvedRelationFilter, traitId: number, target: Entity): boolean {
  if (pair.relation[$internal].trait.id !== traitId) return false;
  const matches = pair.targetQueryMatches;
  return matches !== undefined ? matches.has(target) : pair.target === target;
}

/** Every tracked bit of the group has fired for the entity. */
function matchesAllTrackers(
  trackers: Uint32Array[][],
  bitmasks: (number | undefined)[],
  eid: number
): boolean {
  for (let genId = 0; genId < bitmasks.length; genId++) {
    const mask = bitmasks[genId];
    if (!mask) continue;
    if ((trackers[genId][eid >>> 10][eid & 1023] & mask) !== mask) return false;
  }
  return true;
}

/** At least one tracked bit of the group has fired for the entity. */
function matchesAnyTracker(
  trackers: Uint32Array[][],
  bitmasks: (number | undefined)[],
  eid: number
): boolean {
  for (let genId = 0; genId < bitmasks.length; genId++) {
    const mask = bitmasks[genId];
    if (!mask) continue;
    if (trackers[genId][eid >>> 10][eid & 1023] & mask) return true;
  }
  return false;
}

function matchesStaticBitmasks(
  masks: number[],
  entityMasks: Uint32Array[][],
  pageId: number,
  slot: number,
  retained: boolean
): boolean {
  return matchesStaticMasks(masks, entityMasks, pageId, slot, retained);
}

function clearTrackerHit(
  trackers: Uint32Array[][],
  generationId: number,
  eid: number,
  bitflag: number
) {
  const generation = trackers[generationId];
  if (generation === undefined) return;
  // An unallocated page reads as zero, so it is never written.
  const page = generation[eid >>> 10];
  const hits = page[eid & 1023];
  if ((hits & bitflag) !== 0) page[eid & 1023] = hits & ~bitflag;
}

/** Remember that the tracked event fired for the entity. A group holds a table for every generation it tracks. */
function recordTrackerHit(
  trackers: Uint32Array[][],
  generationId: number,
  eid: number,
  bitflag: number
) {
  ensureTrackerPage(trackers[generationId], eid >>> 10)[eid & 1023] |= bitflag;
}

/** Advance the revision and notify registered Changed queries. */
export /* @inline */ function markTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (data.trackingQueries.length !== 0) notifyChangedTrackingQueries(ctx, entity, data);
}

/**
 * Re-evaluate the Changed queries of a written trait. A query whose static terms reject the
 * entity only records the write. When every query rejects it, running them again changes nothing
 * until the entity's traits change. The pending bit records that, so later writes return on it.
 */
export function notifyChangedTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  const { generationId, bitflag } = data;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  const page = data.masks[pageId];
  if ((page[slot + PENDING_WORD] & bitflag) !== 0) return;
  // An unchecked write can reach here without the trait, on a page that may be the shared sentinel.
  if ((page[slot] & bitflag) === 0) return;

  const entityMasks = ctx.entityMasks;
  const queries = data.trackingQueries;
  let accepted = false;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if ((query.changedMasks[generationId] & bitflag) === 0) continue;

    // Identifier filters and mixed or terms need current membership and tracked events.
    if (query.identifierFilters !== undefined || query.filters?.tracking) {
      accepted = true;
      if (checkQueryTracking(ctx, query, entity, 'change', generationId, bitflag)) {
        addEntityToQuery(query, entity);
      } else removeEntityFromQuery(query, entity);
      continue;
    }

    // A rejected entity left the batch when it lost the static terms, so only the write is kept.
    if (!matchesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains)) {
      recordChange(query, generationId, eid, bitflag);
      continue;
    }

    accepted = true;
    if (
      recordChangeAndMatch(query, generationId, eid, bitflag) &&
      (query.filters === null || matchesQueryFilters(ctx, query, entity))
    ) {
      addEntityToQuery(query, entity);
    } else removeEntityFromQuery(query, entity);
  }

  if (!accepted) {
    page[slot + PENDING_WORD] |= bitflag;
    ctx.defersChanges = true;
  }
}

/** Mark the trait written in the Changed groups of a query without evaluating it. */
function recordChange(query: QueryInstance, generationId: number, eid: number, bitflag: number) {
  const groups = query.trackingGroups;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (
      group.type === 'change' &&
      (group.bitmasks[generationId]! & bitflag) !== 0 &&
      group.pairs === null
    ) {
      recordTrackerHit(group.trackers, generationId, eid, bitflag);
    }
  }
}

/**
 * Clear the pending bits of an entity so its next writes are evaluated again. Every Changed
 * query already holds the deferred writes in its own tracker, so nothing is copied.
 */
export function clearPendingChanges(ctx: WorldContext, eid: number) {
  const entityMasks = ctx.entityMasks;
  const pageId = eid >>> 10;
  const index = ((eid & 1023) << 2) + PENDING_WORD;
  const generations = ctx.generations;
  for (let i = 0; i < generations.length; i++) {
    const page = entityMasks[generations[i]][pageId];
    if (page[index] !== 0) page[index] = 0;
  }
}

/**
 * Shared sentinel for unallocated tracker pages. Trackers hold one word per entity. Always
 * reads as 0. Never write to it directly.
 */
export const EMPTY_TRACKER_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE);

/** Materialize a tracker page on first write. */
/* @inline */ function ensureTrackerPage(gen: Uint32Array[], pageId: number): Uint32Array {
  let page = gen[pageId];
  if (page === EMPTY_TRACKER_PAGE) {
    page = new Uint32Array(PAGE_SIZE);
    gen[pageId] = page;
  }
  return page;
}

/** Extend the tracker tables of every query to cover the page limit. */
export function growTrackerTables(ctx: WorldContext, pageLimit: number) {
  for (const query of ctx.queriesHashMap.values()) {
    const groups = query.trackingGroups;
    for (let i = 0; i < groups.length; i++) {
      const trackers = groups[i].trackers;
      for (let j = 0; j < trackers.length; j++) {
        if (trackers[j]) growPageTable(trackers[j], pageLimit, EMPTY_TRACKER_PAGE);
      }
    }
  }
}

/** A Changed query anywhere in the world reads the writes a walk makes to the trait. */
export function hasChangedQuery(instance: TraitInstance) {
  const { trackingQueries, generationId, bitflag } = instance;
  for (let i = 0; i < trackingQueries.length; i++) {
    if ((trackingQueries[i].changedMasks[generationId] & bitflag) !== 0) return true;
  }
  return false;
}
