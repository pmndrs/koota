import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { getTraitInstance } from '../../trait/trait-instance';
import type { Trait } from '../../trait/types';
import type { World } from '../../world';
import type { QueryInstance } from '../types';

/**
 * Check if an entity matches a non-tracking query.
 * Uses per-trait bitSet.has(eid) — O(1) per trait, no generation loop.
 */
export function checkQuery(world: World, query: QueryInstance, entity: Entity): boolean {
    const { required, forbidden, or } = query.traitInstances;
    const eid = getEntityId(entity);

    if (required.length === 0 && forbidden.length === 0 && or.length === 0) return false;

    // AND
    for (let i = 0; i < required.length; i++) {
        if (!required[i].bitSet.has(eid)) return false;
    }

    // NOT
    for (let i = 0; i < forbidden.length; i++) {
        if (forbidden[i].bitSet.has(eid)) return false;
    }

    // OR
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

    // Pair filter — O(1) sparse array lookup per pair
    const rf = query.relationFilters;
    if (rf && rf.length > 0) {
        const ctx = world[$internal];
        const entityPairIds = ctx.entityPairIds;
        const pairArr = entityPairIds[eid];
        for (let i = 0; i < rf.length; i++) {
            const [relation, target] = rf[i];
            if (target === '*') continue; // wildcard always passes (bitSet check above covers presence)
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
