import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { createEmptyMaskGeneration, ensureMaskPage } from '../../entity/utils/paged-mask';
import { WorldInternal } from '../../world';
import { EventType, QueryInstance } from '../types';

export function checkQueryTracking(
    ctx: WorldInternal,
    query: QueryInstance,
    entity: Entity,
    eventType: EventType,
    eventGenerationId: number,
    eventBitflag: number
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

        if (groupBitmask && (groupBitmask & eventBitflag)) {
            if (eventType === 'remove') {
                if (groupType === 'add' || groupType === 'change') return false;
            } else if (eventType === 'add') {
                if (groupType === 'remove' || groupType === 'change') return false;
            }

            if (groupType === eventType) {
                if (eventType === 'change') {
                    const entityMask = entityMasks[eventGenerationId][eid >>> 10][eid & 1023];
                    if (!(entityMask & eventBitflag)) return false;
                }

                const groupTrackers = group.trackers;
                if (!groupTrackers[eventGenerationId]) {
                    groupTrackers[eventGenerationId] = createEmptyMaskGeneration();
                }
                ensureMaskPage(groupTrackers[eventGenerationId], eid >>> 10)[eid & 1023] |= eventBitflag;
            }
        }

        if (groupLogic === 'or') {
            hasOrGroup = true;
            if (!anyOrMatched) {
                const groupTrackers = group.trackers;
                const bitmaskLen = groupBitmasks.length;
                for (let genId = 0; genId < bitmaskLen; genId++) {
                    const mask = groupBitmasks[genId];
                    if (!mask) continue;
                    const trackerGen = groupTrackers[genId];
                    const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
                    if (tracker & mask) {
                        anyOrMatched = true;
                        break;
                    }
                }
            }
        } else {
            const groupTrackers = group.trackers;
            const bitmaskLen = groupBitmasks.length;
            for (let genId = 0; genId < bitmaskLen; genId++) {
                const mask = groupBitmasks[genId];
                if (!mask) continue;
                const trackerGen = groupTrackers[genId];
                const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
                if ((tracker & mask) !== mask) {
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
