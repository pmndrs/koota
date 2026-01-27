import { $internal } from '../../common';
import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { World } from '../../world';
import { EventType, QueryInstance } from '../types';

/**
 * Check if an entity matches a tracking query with event handling.
 *
 * PERF: This is a hot path - avoid object destructuring, use indexed loops,
 * cache property accesses, and avoid closures.
 */
export function checkQueryTracking(
    world: World,
    query: QueryInstance,
    entity: Entity,
    eventType: EventType,
    eventGenerationId: number,
    eventBitflag: number
): boolean {
    // Cache array references to avoid repeated property access
    const bitmasks = query.bitmasks;
    const generations = query.generations;
    const orTrackingGroups = query.orTrackingGroups;
    const entityMasks = world[$internal].entityMasks;
    const eid = getEntityId(entity);

    const generationsLen = generations.length;
    const orTrackingLen = orTrackingGroups.length;

    if (query.traitInstances.all.length === 0) return false;

    // Check standard tracking (AND logic)
    for (let i = 0; i < generationsLen; i++) {
        const generationId = generations[i];
        const bitmask = bitmasks[i];

        // Cache bitmask properties to avoid repeated property access
        const required = bitmask.required;
        const forbidden = bitmask.forbidden;
        const or = bitmask.or;
        const added = bitmask.added;
        const removed = bitmask.removed;
        const changed = bitmask.changed;
        const entityMask = entityMasks[generationId][eid];

        if (!forbidden && !required && !or && !removed && !added && !changed) {
            // If we have or-tracking groups, don't fail yet - check those
            if (orTrackingLen === 0) return false;
            continue;
        }

        // Handle events only for matching generation
        if (eventGenerationId === generationId) {
            if (eventType === 'add') {
                if (removed & eventBitflag) return false;
                if (added & eventBitflag) {
                    bitmask.addedTracker[eid] |= eventBitflag;
                }
            } else if (eventType === 'remove') {
                if (added & eventBitflag) return false;
                if (removed & eventBitflag) {
                    bitmask.removedTracker[eid] |= eventBitflag;
                }
                if (changed & eventBitflag) return false;
            } else if (eventType === 'change') {
                if (!(entityMask & eventBitflag)) return false;
                if (changed & eventBitflag) {
                    bitmask.changedTracker[eid] |= eventBitflag;
                }
            }
        }

        // Check forbidden traits
        if ((entityMask & forbidden) !== 0) return false;

        // Check required traits
        if ((entityMask & required) !== required) return false;

        // Check Or traits
        if (or !== 0 && (entityMask & or) === 0) return false;

        // Check tracking masks only for matching generation
        if (eventGenerationId === generationId) {
            if (added) {
                const entityAddedTracker = bitmask.addedTracker[eid] | 0;
                if ((entityAddedTracker & added) !== added) return false;
            }
            if (removed) {
                const entityRemovedTracker = bitmask.removedTracker[eid] | 0;
                if ((entityRemovedTracker & removed) !== removed) return false;
            }
            if (changed) {
                const entityChangedTracker = bitmask.changedTracker[eid] | 0;
                if ((entityChangedTracker & changed) !== changed) return false;
            }
        }
    }

    // Check or-tracking groups (OR logic - entity matches if ANY trait in the group matches)
    if (orTrackingLen > 0) {
        for (let i = 0; i < orTrackingLen; i++) {
            const group = orTrackingGroups[i];

            // Only check groups that match the event type
            if (group.type !== eventType) continue;

            // Check if this event's bitflag is relevant to this group
            const groupBitmask = group.bitmasksByGeneration[eventGenerationId];
            if (groupBitmask && groupBitmask & eventBitflag) {
                // This event is relevant to this group - entity matches
                return true;
            }
        }

        // If we only have or-tracking groups and none matched, fail
        if (generationsLen === 0) return false;

        let hasAnyTracking = false;
        for (let i = 0; i < generationsLen; i++) {
            const b = bitmasks[i];
            if (b.added || b.removed || b.changed) {
                hasAnyTracking = true;
                break;
            }
        }
        if (!hasAnyTracking) return false;
    }

    return true;
}
