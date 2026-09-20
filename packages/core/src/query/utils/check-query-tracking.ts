import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { createEmptyMaskGeneration, ensureMaskPage } from '../../entity/utils/paged-mask';
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

  const staticBitmasks = query.staticBitmasks;
  const trackingGroups = query.trackingGroups;
  const generations = query.generations;
  const traitInstancesAll = query.traitInstances.all;
  const entityMasks = ctx.entityMasks;
  const eid = getEntityId(entity);

  const trackingGroupsLen = trackingGroups.length;

  if (traitInstancesAll.length === 0) return false;
  if (!passesStaticBitmasks(staticBitmasks, generations, entityMasks, eid)) return false;

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
  staticBitmasks: QueryInstance['staticBitmasks'],
  generations: number[],
  entityMasks: Uint32Array[][],
  eid: number
): boolean {
  for (let i = 0; i < generations.length; i++) {
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;

    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const entityMask = entityMasks[generations[i]][eid >>> 10][eid & 1023];

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
