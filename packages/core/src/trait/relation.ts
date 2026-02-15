import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import type {
    FieldDescriptor,
    InferSchema,
    SchemaFor,
    SchemaShorthand,
    TagSchema,
    TraitKind,
} from '../storage';
import type { World } from '../world';
import { defineTrait, hasTrait } from './trait';
import { getTraitInstance } from './trait-instance';
import type { Relation, RelationPair } from './types';

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
 * Returns the first target entity ID, or undefined if none exists.
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
 * Get the index of a target in the relation's target array.
 * Returns -1 if not found. Used for accessing per-target store data.
 */
export /* @inline */ function getTargetIndex(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): number {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets) return -1;

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets[eid];
    return targets ? targets.indexOf(target) : -1;
}

/**
 * Check if an entity has a relation to a specific target.
 */
export /* @inline */ function hasRelationToTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): boolean {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData || !traitData.relationTargets) return false;

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets[eid];
    return targets ? targets.includes(target) : false;
}

/**
 * Add a relation target to an entity.
 * Returns the index of the target in the targets array.
 * If the target already exists, returns -1.
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

    if (!traitData.relationTargets) {
        traitData.relationTargets = [];
    }

    const eid = getEntityId(entity);
    const targets = traitData.relationTargets;
    if (!targets[eid]) {
        targets[eid] = [];
    }

    const existingIndex = targets[eid].indexOf(target);
    if (existingIndex !== -1) {
        return -1;
    }

    const targetIndex = targets[eid].length;
    targets[eid].push(target);

    updateQueriesForRelationChange(world, relation, entity);

    return targetIndex;
}

/**
 * Remove a relation target from an entity.
 * Returns the removed index and whether this was the last target.
 */
export function removeRelationTarget(
    world: World,
    relation: Relation,
    entity: Entity,
    target: Entity
): { removedIndex: number; wasLastTarget: boolean } {
    const ctx = world[$internal];
    const data = getTraitInstance(ctx.traitInstances, relation);
    if (!data || !data.relationTargets) return { removedIndex: -1, wasLastTarget: false };

    const eid = getEntityId(entity);

    let removedIndex = -1;
    let hasRemainingTargets = false;
    const targetsArray = data.relationTargets;
    const entityTargets = targetsArray[eid];
    if (entityTargets) {
        const idx = entityTargets.indexOf(target);
        if (idx !== -1) {
            const lastIdx = entityTargets.length - 1;
            if (idx !== lastIdx) {
                entityTargets[idx] = entityTargets[lastIdx];
            }
            entityTargets.pop();
            swapAndPopRelationData(data.store, relation.schema.kind, eid, idx, lastIdx);
            removedIndex = idx;
            hasRemainingTargets = entityTargets.length > 0;
        }
    }

    if (removedIndex !== -1) {
        updateQueriesForRelationChange(world, relation, entity);
    }

    const wasLastTarget = removedIndex !== -1 && !hasRemainingTargets;
    return { removedIndex, wasLastTarget };
}

/**
 * Update queries when relation targets change.
 * Called after addRelationTarget or removeRelationTarget to keep queries in sync.
 */
function updateQueriesForRelationChange(world: World, relation: Relation, entity: Entity): void {
    const ctx = world[$internal];
    const traitData = getTraitInstance(ctx.traitInstances, relation);
    if (!traitData) return;

    // Update queries indexed by this relation (much faster than iterating all queries)
    // All queries in relationQueries already filter by this relation
    for (const query of traitData.relationQueries) {
        // Re-check entity against query
        const match = checkQueryWithRelations(world, query, entity);
        if (match) {
            query.add(entity);
        } else {
            query.remove(world, entity);
        }
    }
}

/** Swap-and-pop data arrays for relation targets */
function swapAndPopRelationData(
    store: any,
    kind: TraitKind,
    eid: number,
    idx: number,
    lastIdx: number
): void {
    if (kind === 'aos') {
        const arr = store[eid];
        if (arr) {
            if (idx !== lastIdx) arr[idx] = arr[lastIdx];
            arr.pop();
        }
    } else {
        for (const key in store) {
            const arr = store[key][eid];
            if (arr) {
                if (idx !== lastIdx) arr[idx] = arr[lastIdx];
                arr.pop();
            }
        }
    }
}

/**
 * Remove all relation targets from an entity.
 * Used for bulk removal when the base trait is also being removed.
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

    // Scan all entities to find those with relation to this target
    for (let eid = 0; eid < relationTargets.length; eid++) {
        let hasTarget = false;

        const targets = relationTargets[eid];
        hasTarget = targets ? targets.includes(targetId) : false;

        if (hasTarget) {
            // O(1) lookup via sparse array
            const denseIdx = sparse[eid];
            if (denseIdx !== undefined && getEntityId(dense[denseIdx]) === eid) {
                result.push(dense[denseIdx]);
            }
        }
    }

    return result;
}

/**
 * Set data for a specific relation target using target index.
 * Index corresponds to position in the target array.
 */
export function setRelationDataAtIndex(
    world: World,
    entity: Entity,
    relation: Relation,
    targetIndex: number,
    value: Record<string, unknown>
): void {
    const traitData = getTraitInstance(world[$internal].traitInstances, relation);
    if (!traitData) return;
    traitData.accessors.pairSet!(getEntityId(entity), targetIndex, traitData.store, value);
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
    if (!traitData) return undefined;

    const targetIndex = getTargetIndex(world, relation, entity, target);
    if (targetIndex === -1) return undefined;

    return traitData.accessors.pairGet!(getEntityId(entity), targetIndex, traitData.store);
}

/**
 * Check if entity has a relation pair.
 */
export function hasPair(world: World, entity: Entity, pair: RelationPair): boolean {
    const [relation, target] = pair;

    // Check if entity has the base trait
    if (!hasTrait(world, entity, relation)) return false;

    // Wildcard target
    if (target === '*') return true;

    // Specific target
    if (typeof target === 'number') return hasRelationToTarget(world, relation, entity, target);

    return false;
}
