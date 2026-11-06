import { $internal } from '../../common';
import { matchesIdentifiers } from '../../identifier/identifier';
import { Entity } from '../../entity/types';
import { isEntityAlive, isEntityReadable } from '../../entity/utils/entity-index';
import { GENERATION_MASK, getEntityId } from '../../entity/utils/pack-entity';
import {
  DESTROYED_WORD,
  REMOVED_WORD,
  createEmptyMaskGeneration,
  ensureMaskPage,
} from '../../entity/utils/paged-mask';
import { hasRelationToTarget } from '../../relation/relation';
import { WorldContext } from '../../world';
import { EventType, QueryInstance, ResolvedRelationFilter } from '../types';
import { holdsFilterPair, passesQueryFilters } from './check-query-filters';

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
      if (!anyOrMatched && trackersMatchAny(group.trackers, groupBitmasks, eid)) anyOrMatched = true;
    } else if (matched && !trackersMatchAll(group.trackers, groupBitmasks, eid)) {
      matched = false;
    }
  }

  if (!matched || (hasOrGroup && !anyOrMatched && !query.filters?.tracking)) {
    return false;
  }

  return (
    passesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains) &&
    (query.filters === null || passesQueryFilters(ctx, query, entity, anyOrMatched))
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
  if (!passesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains)) {
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
        if (holdsFilterPair(ctx, entity, pairs[p])) recordTrackerHit(group.trackers, 0, eid, 1 << p);
      }
    }

    if (group.logic === 'or') {
      hasOrGroup = true;
      if (!anyOrMatched && trackersMatchAny(group.trackers, bitmasks, eid)) anyOrMatched = true;
    } else if (matched && !trackersMatchAll(group.trackers, bitmasks, eid)) {
      matched = false;
    }
  }

  if (!matched || (hasOrGroup && !anyOrMatched && !query.filters?.tracking)) return false;
  return query.filters === null || passesQueryFilters(ctx, query, entity, anyOrMatched);
}

/**
 * Record a write in the Changed groups that track the trait, then report whether the tracking
 * groups are satisfied. Every and group must have fired in full and, when or groups exist, at
 * least one of them in part.
 */
export function recordChangeAndMatch(
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
      if (!anyOrMatched && (hit || trackersMatchAny(group.trackers, bitmasks, eid))) {
        anyOrMatched = true;
      }
    } else if (
      matched &&
      !(hit && group.single) &&
      !trackersMatchAll(group.trackers, bitmasks, eid)
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
          passesStaticBitmasks(query.masks, ctx.entityMasks, eid >>> 10, (eid & 1023) << 2, true)
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

/** The tracked pair is this relation with this target, or with a target its target query matches. */
function coversPair(pair: ResolvedRelationFilter, traitId: number, target: Entity): boolean {
  if (pair.relation[$internal].trait.id !== traitId) return false;
  const matches = pair.targetQueryMatches;
  return matches !== undefined ? matches.has(target) : pair.target === target;
}

/** Every tracked bit of the group has fired for the entity. */
function trackersMatchAll(
  trackers: Uint32Array[][],
  bitmasks: (number | undefined)[],
  eid: number
): boolean {
  for (let genId = 0; genId < bitmasks.length; genId++) {
    const mask = bitmasks[genId];
    if (!mask) continue;
    const trackerGen = trackers[genId];
    const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
    if ((tracker & mask) !== mask) return false;
  }
  return true;
}

/** At least one tracked bit of the group has fired for the entity. */
function trackersMatchAny(
  trackers: Uint32Array[][],
  bitmasks: (number | undefined)[],
  eid: number
): boolean {
  for (let genId = 0; genId < bitmasks.length; genId++) {
    const mask = bitmasks[genId];
    if (!mask) continue;
    const trackerGen = trackers[genId];
    const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
    if (tracker & mask) return true;
  }
  return false;
}

/**
 * The entity satisfies every static required, forbidden and or mask of the query. Static terms
 * read the traits an entity holds. A Removed query also reads the traits a dead entity or an
 * event died with, so its other terms describe the row as it ended.
 */
export function passesStaticBitmasks(
  masks: number[],
  entityMasks: Uint32Array[][],
  pageId: number,
  slot: number,
  retained: boolean
): boolean {
  for (let i = 0; i < masks.length; i += 4) {
    const required = masks[i + 1];
    const forbidden = masks[i + 2];
    const or = masks[i + 3];
    const page = entityMasks[masks[i]][pageId];
    const entityMask = retained ? page[slot] | page[slot + DESTROYED_WORD] : page[slot];

    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  return true;
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

/** Remember that the tracked event fired for the entity, allocating the tracker lazily. */
export function recordTrackerHit(
  trackers: Uint32Array[][],
  generationId: number,
  eid: number,
  bitflag: number
) {
  if (!trackers[generationId]) trackers[generationId] = createEmptyMaskGeneration();
  ensureMaskPage(trackers[generationId], eid >>> 10)[eid & 1023] |= bitflag;
}
