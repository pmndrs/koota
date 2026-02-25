import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import { checkQuery } from '../query/utils/check-query';
import type { FieldDescriptor, InferSchema, SchemaFor, SchemaShorthand, TagSchema } from '../storage';
import type { World } from '../world';
import { addTraitToEntity, defineTrait, hasTrait, removeTraitFromEntity } from './trait';
import { getTraitInstance } from './trait-instance';
import type { PairPattern, Relation, PairTarget, TraitInstance } from './types';

/** @see {@link relation} for overload signatures */
export interface relation {
    (schema?: undefined | Record<string, never>): Relation<Record<string, never>> & {
        readonly schema: TagSchema;
    };
    <T>(schema: () => T): Relation<T>;
    <T>(schema: FieldDescriptor<T> & { kind: 'ref' }): Relation<T>;
    <T>(schema: SchemaFor<T>): Relation<T>;
    <D extends SchemaShorthand>(schema: D): Relation<InferSchema<D>>;
}

export const relation: relation = ((schema: SchemaShorthand | FieldDescriptor = {}): Relation => {
    return defineTrait(schema, 'binary') as Relation;
}) as relation;

/**
 * Get the targets for a relation on an entity.
 * Returns an array of target entity IDs.
 */
export /* @inline */ function getRelationTargets(
    world: World,
    relation: Relation,
    entity: Entity
): readonly Entity[] {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets) return [];

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets[eid];
    return targets !== undefined ? (targets.slice() as Entity[]) : [];
}

/**
 * Get the first target for a relation on an entity.
 * Optimized version that avoids array allocation.
 */
export /* @inline */ function getFirstRelationTarget(
    world: World,
    relation: Relation,
    entity: Entity
): Entity | undefined {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets) return undefined;

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets[eid];
    return targets?.[0] as Entity | undefined;
}

/**
 * Get the flat store slot for a (entity, target) pair.
 * Returns -1 if not found.
 */
export /* @inline */ function getPairSlot(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): number {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets || !traitData.slotMap) return -1;

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets[eid];
    if (!targets) return -1;

    const localIdx = targets.indexOf(target);
    return localIdx !== -1 ? traitData.slotMap[eid][localIdx] : -1;
}

/**
 * Check if an entity has a relation to a specific target.
 * @deprecated Use hasPair which uses the O(1) sparse array.
 */
export /* @inline */ function hasRelationToTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): boolean {
    const ctx = world[$internal];
    const instance = getTraitInstance(ctx.traitInstances, relation);
    if (!instance || !instance.targetPairIds) return false;

    const targetEid = getEntityId(target);
    const pairId = instance.targetPairIds[targetEid];
    if (pairId === undefined) return false;

    const eid = getEntityId(entity);
    const pairArr = ctx.entityPairIds[eid];
    return pairArr !== undefined && pairArr[pairId] === 1;
}

/* @inline */ function allocateSlot(data: TraitInstance): number {
    if (data.freeSlots!.length > 0) return data.freeSlots!.pop()!;
    return data.nextSlot!++;
}

/* @inline */ function allocatePairId(world: World): number {
    const ctx = world[$internal];
    return ctx.pairFreeIds.length > 0 ? ctx.pairFreeIds.pop()! : ctx.pairNextId++;
}

/**
 * Add a relation target to an entity.
 * Returns the flat store slot for the new pair, or -1 if already exists.
 */
export function addRelationTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): number {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData) return -1;

    if (!traitData.relationTargets) traitData.relationTargets = [];
    if (!traitData.slotMap) traitData.slotMap = [];
    if (!traitData.targetPairIds) traitData.targetPairIds = [];

    const eid = getEntityId(entity);
    const targetEid = getEntityId(target);

    if (!traitData.relationTargets[eid]) traitData.relationTargets[eid] = [];
    if (!traitData.slotMap[eid]) traitData.slotMap[eid] = [];

    // Get or allocate a global compact pairId for this (relation, target) combination.
    // targetPairIds[targetEid] = pairId — one integer-indexed array read, no hashing.
    let pairId = traitData.targetPairIds[targetEid];
    if (pairId === undefined) {
        pairId = allocatePairId(world);
        traitData.targetPairIds[targetEid] = pairId;
        ctx.pairRefCount[pairId] = 0;
    }

    // Check if entity already has this pair via O(1) sparse array
    if (!ctx.entityPairIds[eid]) ctx.entityPairIds[eid] = [];
    if (ctx.entityPairIds[eid][pairId] === 1) return -1;

    // Set membership and increment ref count
    ctx.entityPairIds[eid][pairId] = 1;
    ctx.pairRefCount[pairId]++;

    // Mark pair dirty for all active tracking IDs (infrastructure for Added(pair) tracking)
    const pairDirtyMasks = ctx.pairDirtyMasks;
    for (let i = 0; i < pairDirtyMasks.length; i++) {
        const mask = pairDirtyMasks[i];
        if (!mask) continue;
        if (!mask[eid]) mask[eid] = [];
        mask[eid][pairId] = 1;
    }

    // Allocate flat slot for data storage
    const slot = allocateSlot(traitData);
    traitData.relationTargets[eid].push(target);
    traitData.slotMap[eid].push(slot);

    updateQueriesForRelationChange(world, relation, entity, pairId);

    return slot;
}

/**
 * Remove a relation target from an entity.
 * Frees the flat store slot. Returns whether this was the last target.
 */
export function removeRelationTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): { removed: boolean; wasLastTarget: boolean } {
    const ctx = world[$internal];
    const data = getTraitInstance(ctx.traitInstances, relation);
    if (!data || !data.relationTargets || !data.slotMap)
        return { removed: false, wasLastTarget: false };

    const eid = getEntityId(entity);
    const targetEid = getEntityId(target);
    const entityTargets = data.relationTargets[eid];
    const entitySlots = data.slotMap[eid];
    if (!entityTargets || !entitySlots) return { removed: false, wasLastTarget: false };

    const idx = entityTargets.indexOf(target);
    if (idx === -1) return { removed: false, wasLastTarget: false };

    // Update sparse pair membership and ref count
    const pairId = data.targetPairIds?.[targetEid];
    if (pairId !== undefined) {
        const pairArr = ctx.entityPairIds[eid];
        if (pairArr) pairArr[pairId] = 0;

        ctx.pairRefCount[pairId]--;
        // Recycle the pairId when no entity holds this (relation, target) anymore
        if (ctx.pairRefCount[pairId] === 0) {
            data.targetPairIds![targetEid] = undefined!;
            ctx.pairFreeIds.push(pairId);
        }

        // Mark pair dirty for all active tracking IDs (infrastructure for Removed(pair) tracking)
        const pairDirtyMasks = ctx.pairDirtyMasks;
        for (let i = 0; i < pairDirtyMasks.length; i++) {
            const mask = pairDirtyMasks[i];
            if (!mask) continue;
            if (!mask[eid]) mask[eid] = [];
            mask[eid][pairId] = 1;
        }
    }

    // Free the flat data slot
    data.freeSlots!.push(entitySlots[idx]);

    // Swap-and-pop the parallel target/slot arrays
    const lastIdx = entityTargets.length - 1;
    if (idx !== lastIdx) {
        entityTargets[idx] = entityTargets[lastIdx];
        entitySlots[idx] = entitySlots[lastIdx];
    }
    entityTargets.pop();
    entitySlots.pop();

    updateQueriesForRelationChange(world, relation, entity, pairId);

    return { removed: true, wasLastTarget: entityTargets.length === 0 };
}

/**
 * Update queries when a relation pair is added or removed for an entity.
 * Uses pairQueries for exact-pair queries (O(1) lookup) and
 * relationQueries for wildcard/non-specific filters.
 */
function updateQueriesForRelationChange(
    world: World,
    relation: Relation,
    entity: Entity,
    pairId: number | undefined
): void {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData) return;

    // Re-evaluate exact-pair queries first (pairQueries[pairId])
    if (pairId !== undefined) {
        const exactQueries = ctx.pairQueries[pairId];
        if (exactQueries) {
            for (let i = 0; i < exactQueries.length; i++) {
                const query = exactQueries[i];
                const match = checkQuery(world, query, entity);
                if (match) query.add(entity);
                else query.remove(world, entity);
            }
        }
    }

    // Re-evaluate wildcard / non-exact-pair relation queries
    for (let qi = 0, qLen = traitData.relationQueries.length; qi < qLen; qi++) {
        const query = traitData.relationQueries[qi];
        // Skip queries already handled by pairQueries above
        if (pairId !== undefined && ctx.pairQueries[pairId]?.includes(query)) continue;
        const match = checkQuery(world, query, entity);
        if (match) query.add(entity);
        else query.remove(world, entity);
}

/**
 * Remove all relation targets from an entity.
 */
export function removeAllRelationTargets(world: World, relation: Relation, entity: Entity): void {
    const targets = getRelationTargets(world, relation, entity);
    for (const target of targets) {
        removeRelationTarget(world, relation, entity, target);
    }
}

/**
 * Get all entities that have a specific relation targeting a specific entity.
 * Builds result on-demand by scanning relationTargets (not maintained in reverse index).
 */
export function getEntitiesWithRelationTo(
    world: World,
    relation: Relation,
    target: Entity
): readonly Entity[] {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets) return [];

    const targetId = target;
    const entityIndex = ctx.entityIndex;
    const sparse = entityIndex.sparse;
    const dense = entityIndex.dense;
    const result: Entity[] = [];
    const relationTargets = traitData.relationTargets;

    for (let eid = 0; eid < relationTargets.length; eid++) {
        const targets = relationTargets[eid];
        if (targets && targets.includes(targetId)) {
            const denseIdx = sparse[eid];
            if (denseIdx !== undefined && getEntityId(dense[denseIdx]) === eid) {
                result.push(dense[denseIdx]);
            }
        }
    }

    return result;
}

/**
 * Set data for a relation pair using its flat store slot.
 */
export function setRelationDataAtSlot(
    relation: Relation,
    slot: number,
    value: Record<string, unknown>,
    world: World
): void {
    const traitData = getTraitInstance(world[$internal].traitInstances, relation);
    if (!traitData || !traitData.pairStore) return;
    traitData.accessors.set(slot, traitData.pairStore, value);
}

/**
 * Get data for a specific relation target.
 */
export function getRelationData(
    world: World,
    entity: Entity,
    relation: Relation,
    target: Entity
): unknown {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.pairStore) return undefined;

    const slot = getPairSlot(world, relation, entity, target);
    if (slot === -1) return undefined;

    return traitData.accessors.get(slot, traitData.pairStore);
}

/**
 * Check if entity has a relation pair. O(1) via sparse array.
 */
export function hasPair(world: World, entity: Entity, pair: PairPattern): boolean {
    const [relation, target] = pair;

    if (!hasTrait(world, entity, relation)) return false;
    if (target === '*') return true;

    if (typeof target === 'number') {
        const ctx = world[$internal];
        const instance = getTraitInstance(ctx.traitInstances, relation);
        if (!instance || !instance.targetPairIds) return false;

        const pairId = instance.targetPairIds[getEntityId(target)];
        if (pairId === undefined) return false;

        const pairArr = ctx.entityPairIds[getEntityId(entity)];
        return pairArr !== undefined && pairArr[pairId] === 1;
    }

    return false;
}

/**
 * Get the compact global pairId for a (relation, target) combination.
 * Returns undefined if no pair ID has been allocated yet.
 */
export /* @inline */ function getPairId(
    world: World,
    relation: Relation,
    target: Entity
): number | undefined {
    const ctx = world[$internal];
    const instance = getTraitInstance(ctx.traitInstances, relation);
    if (!instance || !instance.targetPairIds) return undefined;
    return instance.targetPairIds[getEntityId(target)];
}

// =============================================================================
// Pair operations — called by api.ts dispatch layer
// =============================================================================

export function addPair(
    world: World,
    entity: Entity,
    relation: Relation,
    target: Entity,
    params?: Record<string, any>
) {
    if (typeof target !== 'number') return;

    let instance = addTraitToEntity(world, entity, relation);

    const slot = addRelationTarget(world, relation, entity, target);
    if (slot === -1) return;

    instance = instance ?? getTraitInstance(world[$internal].traitInstances, relation)!;

    const defaults = instance.ctor();
    const merged =
        defaults && typeof defaults === 'object'
            ? {
                  ...(defaults as Record<string, unknown>),
                  ...(params as Record<string, unknown> | undefined),
              }
            : params;
    if (merged) instance.accessors.set(slot, instance.pairStore, merged);

    for (const sub of instance.addSubscriptions) sub(entity, target);
}

export function removePair(world: World, entity: Entity, relation: Relation, target: PairTarget) {
    if (!hasTrait(world, entity, relation)) return;
    const instance = getTraitInstance(world[$internal].traitInstances, relation)!;

    if (target === '*') {
        const targets = getRelationTargets(world, relation, entity);
        for (const tgt of targets) {
            for (const sub of instance.removeSubscriptions) sub(entity, tgt);
        }
        removeAllRelationTargets(world, relation, entity);
        removeTraitFromEntity(world, entity, relation);
    } else {
        if (typeof target !== 'number') return;
        for (const sub of instance.removeSubscriptions) sub(entity, target);
        const { removed, wasLastTarget } = removeRelationTarget(world, relation, entity, target);
        if (!removed) return;
        if (wasLastTarget) removeTraitFromEntity(world, entity, relation);
    }
}

export function setPair(
    world: World,
    entity: Entity,
    relation: Relation,
    target: Entity,
    value: any,
    triggerChanged = true
) {
    if (typeof target !== 'number') return;
    const instance = getTraitInstance(world[$internal].traitInstances, relation)!;
    const slot = getPairSlot(world, relation, entity, target);
    if (slot === -1) return;

    value instanceof Function && (value = value(instance.accessors.get(slot, instance.pairStore)));
    instance.accessors.set(slot, instance.pairStore, value);
    if (triggerChanged) setChanged(world, entity, relation, target);
}

export function getPair(world: World, entity: Entity, relation: Relation, target: Entity) {
    if (typeof target !== 'number') return undefined;

    const slot = getPairSlot(world, relation, entity, target);
    if (slot === -1) return undefined;

    const instance = getTraitInstance(world[$internal].traitInstances, relation)!;
    return instance.accessors.get(slot, instance.pairStore);
}

/**
 * Remove a relation target and clean up the base trait if it was the last target.
 * Used by entity destruction.
 */
export function cleanupRelationTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): void {
    const instance = getTraitInstance(world[$internal].traitInstances, relation);
    if (instance) {
        for (const sub of instance.removeSubscriptions) sub(entity, target);
    }

    const { removed, wasLastTarget } = removeRelationTarget(world, relation, entity, target);
    if (!removed) return;

    if (wasLastTarget) removeTraitFromEntity(world, entity, relation);
}
