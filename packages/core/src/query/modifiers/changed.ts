import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { HiSparseBitSet } from '@koota/collections';
import { getEntityId } from '../../entity/utils/pack-entity';
import { getTraitInstance } from '../../trait/trait-instance';
import type { Trait, TraitInstance } from '../../trait/types';
import { universe } from '../../universe/universe';
import type { World } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
    const id = createTrackingId();

    for (const world of universe.worlds) {
        if (!world) continue;
        setTrackingMasks(world, id);
    }

    return <T extends Trait[]>(...inputs: T): Modifier<T, `changed-${number}`> => {
        return createModifier(`changed-${id}`, id, inputs);
    };
}

/** @inline */
function markChanged(world: World, entity: Entity, trait: Trait) {
    const ctx = world[$internal];

    // Single lookup via bitSet
    const data = getTraitInstance(ctx.traitInstances, trait);
    if (!data) return;

    const eid = getEntityId(entity);
    if (!data.bitSet.has(eid)) return;

    // Mark entity in changed tracking event bitsets (sparse)
    const traitId = trait.id;
    if (ctx.changedBitSets.size > 0) {
        for (const [, traitMap] of ctx.changedBitSets) {
            let bs = traitMap.get(traitId);
            if (!bs) {
                bs = new HiSparseBitSet();
                traitMap.set(traitId, bs);
            }
            bs.insert(eid);
        }
    }

    // Update tracking queries with change event
    for (let qi = 0, qLen = data.trackingQueries.length; qi < qLen; qi++) {
        const query = data.trackingQueries[qi];
        if (!query.hasChangedModifiers) continue;
        if (!query.changedTraits.has(trait)) continue;
        const match = query.checkTracking(world, entity, 'change', trait);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    return data;
}

export function setChanged(world: World, entity: Entity, trait: Trait, target?: Entity) {
    const data = markChanged(world, entity, trait);
    if (!data) return;

    // If this is a relation pair change, also mark pair-level changed mask
    if (target !== undefined) {
        const ctx = world[$internal];
        const instance = getTraitInstance(ctx.traitInstances, trait);
        if (instance && instance.targetPairIds) {
            const pairId = instance.targetPairIds[getEntityId(target)];
            if (pairId !== undefined) {
                const eid = getEntityId(entity);
                const pairChangedMasks = ctx.pairChangedMasks;
                for (let i = 0; i < pairChangedMasks.length; i++) {
                    const mask = pairChangedMasks[i];
                    if (!mask) continue;
                    if (!mask[eid]) mask[eid] = [];
                    mask[eid][pairId] = 1;
                }
            }
        }
        for (const sub of data.changeSubscriptions) sub(entity, target);
    } else {
        for (const sub of data.changeSubscriptions) sub(entity);
    }
}

/**
 * Fast path for updateEach — skips hasTrait/getTraitInstance lookups
 * since the caller already has the resolved instance.
 */
export function setChangedFast(world: World, entity: Entity, trait: Trait, instance: TraitInstance) {
    const ctx = world[$internal];
    const eid = getEntityId(entity);
    const traitId = trait.id;

    if (ctx.changedBitSets.size > 0) {
        for (const [, traitMap] of ctx.changedBitSets) {
            let bs = traitMap.get(traitId);
            if (!bs) {
                bs = new HiSparseBitSet();
                traitMap.set(traitId, bs);
            }
            bs.insert(eid);
        }
    }

    for (let qi = 0, qLen = instance.trackingQueries.length; qi < qLen; qi++) {
        const query = instance.trackingQueries[qi];
        if (!query.hasChangedModifiers) continue;
        if (!query.changedTraits.has(trait)) continue;
        const match = query.checkTracking(world, entity, 'change', trait);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    for (const sub of instance.changeSubscriptions) sub(entity);
}
