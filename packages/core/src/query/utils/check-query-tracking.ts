import { $internal } from '../../common';
import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { getTraitInstance } from '../../trait/trait-instance';
import type { Trait } from '../../trait/types';
import { World } from '../../world';
import { EventType, QueryInstance } from '../types';

/**
 * Check if an entity matches a tracking query with event handling.
 * Uses per-trait bitSet.has(eid) for static constraints and
 * per-trait trackerBitSets for tracking group satisfaction.
 */
export function checkQueryTracking(
    world: World,
    query: QueryInstance,
    entity: Entity,
    eventType: EventType,
    eventTrait: Trait
): boolean {
    const { required, forbidden, or } = query.traitInstances;
    const trackingGroups = query.trackingGroups;
    const eid = getEntityId(entity);

    const trackingGroupsLen = trackingGroups.length;

    // Early exit: no traits to check
    if (query.traitInstances.all.length === 0) return false;

    // 1. Check static constraints via bitSet.has(eid)
    for (let i = 0; i < required.length; i++) {
        if (!required[i].bitSet.has(eid)) return false;
    }

    for (let i = 0; i < forbidden.length; i++) {
        if (forbidden[i].bitSet.has(eid)) return false;
    }

    if (or.length > 0) {
        let anyOr = false;
        for (let i = 0; i < or.length; i++) {
            if (or[i].bitSet.has(eid)) {
                anyOr = true;
                break;
            }
        }
        if (!anyOr) return false;
    }

    // 2. Process tracking groups — update trackerBitSets and check satisfaction
    let hasOrGroup = false;
    let anyOrMatched = false;

    for (let i = 0; i < trackingGroupsLen; i++) {
        const group = trackingGroups[i];
        const groupType = group.type;
        const groupLogic = group.logic;
        const gInstances = group.groupTraitInstances;
        const trackerBitSets = group.trackerBitSets;

        // Find if the event trait is in this group
        let traitIndex = -1;
        for (let j = 0; j < gInstances.length; j++) {
            if (gInstances[j].definition === eventTrait) {
                traitIndex = j;
                break;
            }
        }

        if (traitIndex !== -1) {
            // Cross-event invalidation:
            // - Remove event invalidates Added/Changed tracking
            // - Add event invalidates Removed/Changed tracking
            if (eventType === 'remove') {
                if (groupType === 'add' || groupType === 'change') return false;
            } else if (eventType === 'add') {
                if (groupType === 'remove' || groupType === 'change') return false;
            }

            // Update tracker if event type matches group type
            if (groupType === eventType) {
                if (eventType === 'change') {
                    if (!gInstances[traitIndex].bitSet.has(eid)) return false;
                }

                trackerBitSets[traitIndex].insert(eid);
            }
        }

        // 3. Verify tracking group satisfaction
        if (groupLogic === 'or') {
            hasOrGroup = true;
            if (!anyOrMatched) {
                for (let t = 0; t < trackerBitSets.length; t++) {
                    if (trackerBitSets[t].has(eid)) {
                        anyOrMatched = true;
                        break;
                    }
                }
            }
        } else {
            // AND group: all traits must be tracked
            for (let t = 0; t < trackerBitSets.length; t++) {
                if (!trackerBitSets[t].has(eid)) {
                    return false;
                }
            }
        }
    }

    // If we have OR groups, at least one must match
    if (hasOrGroup && !anyOrMatched) {
        return false;
    }

    // Pair filter — O(1) sparse array lookup per pair
    const rf = query.relationFilters;
    if (rf && rf.length > 0) {
        const ctx = world[$internal];
        const entityPairIds = ctx.entityPairIds;
        const pairArr = entityPairIds[eid];
        for (let i = 0; i < rf.length; i++) {
            const [relation, target] = rf[i];
            if (target === '*') continue;
            if (typeof target !== 'number') return false;
            const instance = getTraitInstance(ctx.traitInstances, relation as unknown as Trait);
            if (!instance || !instance.targetPairIds) return false;
            const pairId = instance.targetPairIds[getEntityId(target)];
            if (pairId === undefined) return false;
            if (!pairArr || pairArr[pairId] !== 1) return false;
        }
    }

    return true;
}
