import { Entity } from "../../entity/types";
import { getEntityId } from "../../entity/utils/pack-entity";
import { WorldContext } from "../../world";
import { EventType, QueryInstance } from "../types";

export function checkQueryTracking(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  eventType: EventType,
  eventGenerationId: number,
  eventBitflag: number,
): boolean {
  const staticBitmasks = query.staticBitmasks;
  const trackingGroups = query.trackingGroups;
  const generations = query.generations;
  const traitInstancesAll = query.traitInstances.all;
  const entityMasks = ctx.entityMasks;
  const eid = getEntityId(entity);

  const generationsLen = generations.length;
  const trackingGroupsLen = trackingGroups.length;

  if (traitInstancesAll.length === 0) return false;

  for (let i = 0; i < generationsLen; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;

    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;

    const entityMask = entityMasks[generationId][eid >>> 10][eid & 1023];

    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
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
      if (eventType === "remove") {
        if (groupType === "add" || groupType === "change") return false;
      } else if (eventType === "add") {
        if (groupType === "remove" || groupType === "change") return false;
      }

      if (groupType === eventType) {
        if (eventType === "change") {
          const entityMask =
            entityMasks[eventGenerationId][eid >>> 10][eid & 1023];
          if (!(entityMask & eventBitflag)) return false;
        }

        const genIds = group.traitGenerationIds;
        const bitflags = group.traitBitflags;
        const bitSets = group.trackerBitSets;
        for (let t = 0; t < genIds.length; t++) {
          if (genIds[t] === eventGenerationId && bitflags[t] === eventBitflag) {
            bitSets[t].insert(eid);
            break;
          }
        }
      }
    }

    const bitSets = group.trackerBitSets;

    if (groupLogic === "or") {
      hasOrGroup = true;
      if (!anyOrMatched) {
        for (let t = 0; t < bitSets.length; t++) {
          if (bitSets[t].has(eid)) {
            anyOrMatched = true;
            break;
          }
        }
      }
    } else {
      for (let t = 0; t < bitSets.length; t++) {
        if (!bitSets[t].has(eid)) {
          return false;
        }
      }
    }
  }

  if (hasOrGroup && !anyOrMatched) {
    return false;
  }

  return true;
}
