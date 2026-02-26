import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { getTraitInstance } from '../../trait/trait-instance';
import type { Trait } from '../../trait/types';
import type { World } from '../../world';
import type { QueryInstance } from '../types';

/**
 * Check if an entity matches a non-tracking query.
 * Handles both bitmask matching and relation pair filtering in one pass.
 */
export function checkQuery(world: World, query: QueryInstance, entity: Entity): boolean {
    const staticBitmasks = query.staticBitmasks;
    const generations = query.generations;
    const ctx = world[$internal];
    const eid = getEntityId(entity);

    if (query.traitInstances.all.length === 0) return false;

    for (let i = 0; i < generations.length; i++) {
        const generationId = generations[i];
        const bitmask = staticBitmasks[i];
        if (!bitmask) continue;

        const required = bitmask.required;
        const forbidden = bitmask.forbidden;
        const or = bitmask.or;
        const entityMask = ctx.entityMasks[generationId]?.[eid] || 0;

        if (!forbidden && !required && !or) return false;
        if (forbidden && (entityMask & forbidden) !== 0) return false;
        if (required && (entityMask & required) !== required) return false;
        if (or !== 0 && (entityMask & or) === 0) return false;
    }

    // Pair filter — O(1) sparse array lookup per pair
    const rf = query.relationFilters;
    if (rf && rf.length > 0) {
        const entityPairIds = ctx.entityPairIds;
        const pairArr = entityPairIds[eid];
        for (let i = 0; i < rf.length; i++) {
            const [relation, target] = rf[i];
            if (target === '*') continue; // wildcard always passes (bitmask check above covers presence)
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
