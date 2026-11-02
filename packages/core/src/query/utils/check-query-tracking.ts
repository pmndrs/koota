import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import {
  CHANGED_WORD,
  DESTROYED_WORD,
  REMOVED_WORD,
  createEmptyMaskGeneration,
  ensureMaskPage,
} from '../../entity/utils/paged-mask';
import { WorldContext } from '../../world';
import { EventType, QueryInstance } from '../types';

export function checkQueryTracking(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  eventType: EventType,
  eventGenerationId: number,
  eventBitflag: number
): boolean {
  if (query.name !== undefined && (query.name === null || ctx.names.get(query.name) !== entity)) {
    return false;
  }

  const trackingGroups = query.trackingGroups;
  const entityMasks = ctx.entityMasks;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;

  const trackingGroupsLen = trackingGroups.length;

  if (query.traitInstances.length === 0) return false;
  // A destroyed entity or an event holds nothing, its static terms read the traits it died with.
  const filterSlot = query.isDestroyed ? slot + DESTROYED_WORD : slot;
  if (!passesStaticBitmasks(query.masks, entityMasks, pageId, filterSlot)) {
    return false;
  }

  let hasOrGroup = false;
  let anyOrMatched = false;

  for (let i = 0; i < trackingGroupsLen; i++) {
    const group = trackingGroups[i];
    const groupType = group.type;
    const groupLogic = group.logic;
    const groupBitmasks = group.bitmasks;
    const groupBitmask = groupBitmasks[eventGenerationId];

    if (groupBitmask && groupBitmask & eventBitflag) {
      if (eventType === 'remove') {
        if (groupType === 'add' || groupType === 'change') return false;
      } else if (eventType === 'add') {
        if (groupType === 'remove' || groupType === 'change') return false;
      }

      if (groupType === eventType) {
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
    } else if (!trackersMatchAll(group.trackers, groupBitmasks, eid)) {
      return false;
    }
  }

  if (hasOrGroup && !anyOrMatched) {
    return false;
  }

  return true;
}

/**
 * Seed a new tracking query from the world history instead of an event. Membership stands in
 * for an add, the removed history for a loss the entity has not undone, the changed history for
 * a write to a trait the entity still holds, and the destroyed history for the traits a retained
 * entity held when it died. A Destroyed query filters on those masks too, since the entity holds
 * nothing now.
 */
export function checkQueryTrackingSeed(ctx: WorldContext, query: QueryInstance, entity: Entity) {
  if (query.traitInstances.length === 0) return false;
  const eid = getEntityId(entity);
  const entityMasks = ctx.entityMasks;
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  const filterSlot = query.isDestroyed ? slot + DESTROYED_WORD : slot;
  if (
    !passesStaticBitmasks(query.masks, entityMasks, pageId, filterSlot)
  ) {
    return false;
  }

  const trackingGroups = query.trackingGroups;
  let hasOrGroup = false;
  let anyOrMatched = false;

  for (let i = 0; i < trackingGroups.length; i++) {
    const group = trackingGroups[i];
    const bitmasks = group.bitmasks;
    const type = group.type;
    const word =
      type === 'add'
        ? 0
        : type === 'remove'
          ? REMOVED_WORD
          : type === 'change'
            ? CHANGED_WORD
            : DESTROYED_WORD;

    for (let genId = 0; genId < bitmasks.length; genId++) {
      const mask = bitmasks[genId];
      if (!mask) continue;
      const page = entityMasks[genId][pageId];
      const held = page[slot];
      let hits = page[slot + word] & mask;
      if (type === 'remove') hits &= ~held;
      else if (type !== 'destroy') hits &= held;
      if (hits !== 0) recordTrackerHit(group.trackers, genId, eid, hits);
    }

    if (group.logic === 'or') {
      hasOrGroup = true;
      if (!anyOrMatched && trackersMatchAny(group.trackers, bitmasks, eid)) anyOrMatched = true;
    } else if (!trackersMatchAll(group.trackers, bitmasks, eid)) {
      return false;
    }
  }

  return !hasOrGroup || anyOrMatched;
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

/** The entity satisfies every static required, forbidden and or mask of the query. */
function passesStaticBitmasks(
  masks: number[],
  entityMasks: Uint32Array[][],
  pageId: number,
  slot: number
): boolean {
  for (let i = 0; i < masks.length; i += 4) {
    const required = masks[i + 1];
    const forbidden = masks[i + 2];
    const or = masks[i + 3];
    const entityMask = entityMasks[masks[i]][pageId][slot];

    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  return true;
}

/** Remember that the tracked event fired for the entity, allocating the tracker lazily. */
function recordTrackerHit(
  trackers: Uint32Array[][],
  generationId: number,
  eid: number,
  bitflag: number
) {
  if (!trackers[generationId]) trackers[generationId] = createEmptyMaskGeneration();
  ensureMaskPage(trackers[generationId], eid >>> 10)[eid & 1023] |= bitflag;
}
