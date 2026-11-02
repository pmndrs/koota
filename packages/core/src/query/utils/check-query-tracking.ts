import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { createEmptyMaskGeneration, ensureMaskPage } from '../../entity/utils/paged-mask';
import { WorldContext } from '../../world';
import { EventType, QueryInstance } from '../types';
import { passesStaticMasks } from './check-query';

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

  const trackingGroupsLen = trackingGroups.length;

  if (!passesStaticMasks(query.masks, entityMasks, eid)) return false;

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
          !(entityMasks[eventGenerationId][eid >>> 10][eid & 1023] & eventBitflag)
        )
          return false;
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
 * for an add, the removed history for a loss the entity has not undone, and the changed history
 * for a write to a trait the entity still holds.
 */
export function checkQueryTrackingSeed(ctx: WorldContext, query: QueryInstance, entity: Entity) {
  if (query.traitInstances.all.length === 0) return false;
  const eid = getEntityId(entity);
  const entityMasks = ctx.entityMasks;
  if (!passesStaticBitmasks(query.staticBitmasks, query.generations, entityMasks, eid)) return false;

  const pageId = eid >>> 10;
  const offset = eid & 1023;
  const trackingGroups = query.trackingGroups;
  let hasOrGroup = false;
  let anyOrMatched = false;

  for (let i = 0; i < trackingGroups.length; i++) {
    const group = trackingGroups[i];
    const bitmasks = group.bitmasks;
    const history =
      group.type === 'add'
        ? entityMasks
        : group.type === 'remove'
          ? ctx.removedMasks
          : ctx.changedMasks;

    for (let genId = 0; genId < bitmasks.length; genId++) {
      const mask = bitmasks[genId];
      if (!mask) continue;
      const held = entityMasks[genId][pageId][offset];
      let hits = history[genId][pageId][offset] & mask;
      hits = group.type === 'remove' ? hits & ~held : hits & held;
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
