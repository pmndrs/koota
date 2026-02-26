import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait } from '../trait/types';
import { isPairPattern } from '../trait/utils/is-relation';
import { universe } from '../universe/universe';
import { SparseSet } from '../utils/sparse-set';
import { HiSparseBitSet, forEachIntersection, forEachQuery as forEachBitSetQuery } from '../utils/hi-sparse-bitset';
import type { World } from '../world';
import { getTrackingType, isModifier, isOrWithModifiers, isTrackingModifier } from './modifier';
import { createQueryResult } from './query-result';
import { $queryRef } from './symbols';
import {
    type EventType,
    type Modifier,
    type Query,
    type QueryInstance,
    type QueryParameter,
    type QueryResult,
    type QuerySubscriber,
    type TrackingGroup,
} from './types';
import { checkQuery } from './utils/check-query';
import { checkQueryTracking } from './utils/check-query-tracking';
import { createQueryHash } from './utils/create-query-hash';

export const IsExcluded: TagTrait = trait();

export function runQuery<T extends QueryParameter[]>(
    world: World,
    query: QueryInstance<T>,
    params: QueryParameter[]
): QueryResult<T> {
    commitQueryRemovals(world);

    const raw = query.entities.denseRaw;
    const entities = raw.array.slice(0, raw.length) as Entity[];

    // Clear so it can accumulate again.
    if (query.isTracking) {
        query.entities.clear();
        // PERF: Use indexed loop instead of for...of
        const len = entities.length;
        for (let i = 0; i < len; i++) {
            query.resetTrackingBitmasks(entities[i]);
        }
    }

    return createQueryResult(world, entities, query, params);
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
    query.toRemove.remove(entity);
    query.entities.add(entity);

    // Notify subscriptions.
    for (const sub of query.addSubscriptions) {
        sub(entity);
    }

    query.version++;
}

export function removeEntityFromQuery(world: World, query: QueryInstance, entity: Entity) {
    if (!query.entities.has(entity) || query.toRemove.has(entity)) return;

    const ctx = world[$internal];

    query.toRemove.add(entity);
    ctx.dirtyQueries.add(query);

    // Notify subscriptions.
    for (const sub of query.removeSubscriptions) {
        sub(entity);
    }

    query.version++;
}

export function commitQueryRemovals(world: World) {
    const ctx = world[$internal];
    if (!ctx.dirtyQueries.size) return;

    for (const query of ctx.dirtyQueries) {
        // PERF: Cache denseRaw once instead of calling .dense getter (which .slice()s)
        // on every iteration.
        const raw = query.toRemove.denseRaw;
        for (let i = raw.length - 1; i >= 0; i--) {
            const eid = raw.array[i];
            query.toRemove.remove(eid);
            query.entities.remove(eid);
        }
    }

    ctx.dirtyQueries.clear();
}

/** Reset tracking state for an entity across all tracking groups */
export function resetQueryTrackingBitmasks(query: QueryInstance, eid: number) {
    const groups = query.trackingGroups;
    const len = groups.length;
    for (let i = 0; i < len; i++) {
        const trackerBitSets = groups[i].trackerBitSets;
        for (let j = 0; j < trackerBitSets.length; j++) {
            trackerBitSets[j].remove(eid);
        }
    }
}

/**
 * Unified function to process tracking modifiers with explicit AND/OR logic.
 * Groups modifiers by (type, id, logic) key so same-tracker calls are combined.
 */
function processTrackingModifier(
    world: World,
    query: QueryInstance,
    modifier: Modifier,
    logic: 'and' | 'or',
    ctx: World[typeof $internal],
    groupsMap: Map<string, TrackingGroup>
): void {
    const trackingType = getTrackingType(modifier);
    if (!trackingType) return;

    const id = modifier.id;
    // Key includes logic so Changed(A) at top-level stays separate from Or(Changed(A))
    const key = `${trackingType}-${id}-${logic}`;

    // Find or create tracking group
    let group = groupsMap.get(key);
    if (!group) {
        group = {
            logic,
            type: trackingType,
            id,
            groupTraitInstances: [],
            trackerBitSets: [],
        };
        groupsMap.set(key, group);
        query.trackingGroups.push(group);
    }

    // Register traits and build bitmasks
    for (const trait of modifier.traits) {
        if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
        const instance = getTraitInstance(ctx.traitInstances, trait)!;
        query.traits.push(trait);

        // Add to traitInstances.all for query registration
        query.traitInstances.all.push(instance);

        // Add trait instance and its tracker bitset to the group
        group.groupTraitInstances.push(instance);
        group.trackerBitSets.push(new HiSparseBitSet());

        // Track changed traits for change detection in query-result
        if (trackingType === 'change') {
            query.changedTraits.add(trait);
            query.hasChangedModifiers = true;
        }
    }

    query.isTracking = true;
}

export function createQueryInstance<T extends QueryParameter[]>(
    world: World,
    parameters: T
): QueryInstance {
    const query: QueryInstance = {
        version: 0,
        world,
        parameters,
        hash: '',
        traits: [],
        traitInstances: {
            required: [],
            forbidden: [],
            or: [],
            all: [],
        },

        trackingGroups: [],

        entities: new SparseSet(),
        isTracking: false,
        hasChangedModifiers: false,
        changedTraits: new Set<Trait>(),
        toRemove: new SparseSet(),
        addSubscriptions: new Set<QuerySubscriber>(),
        removeSubscriptions: new Set<QuerySubscriber>(),
        relationFilters: [],

        run: (world: World, params: QueryParameter[]) => runQuery(world, query, params),
        add: (entity: Entity) => addEntityToQuery(query, entity),
        remove: (world: World, entity: Entity) => removeEntityFromQuery(world, query, entity),
        check: (world: World, entity: Entity) => checkQuery(world, query, entity),
        checkTracking: (world: World, entity: Entity, eventType: EventType, eventTrait: Trait) =>
            checkQueryTracking(world, query, entity, eventType, eventTrait),
        resetTrackingBitmasks: (eid: number) => resetQueryTrackingBitmasks(query, eid),
    };

    const ctx = world[$internal];

    // Map for grouping tracking modifiers by (type, id, logic)
    const trackingGroupsMap = new Map<string, TrackingGroup>();

    // Process all parameters
    for (let i = 0; i < parameters.length; i++) {
        const parameter = parameters[i];

        // Handle relation pairs
        if (isPairPattern(parameter)) {
            const [relation] = parameter;

            query.relationFilters!.push(parameter);

            if (!hasTraitInstance(ctx.traitInstances, relation)) registerTrait(world, relation);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, relation)!);
            query.traits.push(relation);

            continue;
        }

        if (isModifier(parameter)) {
            const traits = parameter.traits;

            // Register traits
            for (let j = 0; j < traits.length; j++) {
                const t = traits[j];
                if (!hasTraitInstance(ctx.traitInstances, t)) registerTrait(world, t);
            }

            if (parameter.type === 'not') {
                query.traitInstances.forbidden.push(
                    ...traits.map((t) => getTraitInstance(ctx.traitInstances, t)!)
                );
            } else if (parameter.type === 'or') {
                // Handle regular traits in Or
                query.traitInstances.or.push(
                    ...traits.map((t) => getTraitInstance(ctx.traitInstances, t)!)
                );

                // Handle nested tracking modifiers in Or
                if (isOrWithModifiers(parameter)) {
                    for (const nestedModifier of parameter.modifiers) {
                        if (isTrackingModifier(nestedModifier)) {
                            processTrackingModifier(
                                world,
                                query,
                                nestedModifier,
                                'or',
                                ctx,
                                trackingGroupsMap
                            );
                        }
                    }
                }
            } else if (isTrackingModifier(parameter)) {
                // Top-level tracking modifiers use AND logic
                processTrackingModifier(world, query, parameter, 'and', ctx, trackingGroupsMap);
            }
        } else {
            // Regular trait
            const t = parameter as Trait;
            if (!hasTraitInstance(ctx.traitInstances, t)) registerTrait(world, t);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, t)!);
            query.traits.push(t);
        }
    }

    // Add IsExcluded to the forbidden list
    query.traitInstances.forbidden.push(getTraitInstance(ctx.traitInstances, IsExcluded)!);

    // Build traitInstances.all from static instances (tracking instances already added by processTrackingModifier)
    query.traitInstances.all = [
        ...query.traitInstances.all, // Tracking instances added by processTrackingModifier
        ...query.traitInstances.required,
        ...query.traitInstances.forbidden,
        ...query.traitInstances.or,
    ];

    // Create hash
    query.hash = createQueryHash(parameters);

    // Add to world
    ctx.queriesHashMap.set(query.hash, query);

    // Register query with trait instances
    if (query.isTracking) {
        const all = query.traitInstances.all;
        for (let i = 0; i < all.length; i++) {
            all[i].trackingQueries.push(query);
        }
    } else {
        const all = query.traitInstances.all;
        for (let i = 0; i < all.length; i++) {
            all[i].queries.push(query);
        }
    }

    // Add to notQueries if has forbidden traits
    if (query.traitInstances.forbidden.length > 0) ctx.notQueries.add(query);

    // Index queries with relation filters
    const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;

    if (hasRelationFilters) {
        for (const pair of query.relationFilters!) {
            const relationTrait = pair[0] as unknown as Trait;
            const target = pair[1];
            const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
            if (relationTraitInstance) {
                relationTraitInstance.relationQueries.push(query);
            }

            // For exact-pair filters (non-wildcard), also index in pairQueries[pairId].
            // pairId may not exist yet (no entity has this pair), so we allocate it eagerly.
            if (target !== '*' && typeof target === 'number') {
                const inst = getTraitInstance(ctx.traitInstances, relationTrait);
                if (inst) {
                    if (!inst.targetPairIds) inst.targetPairIds = [];
                    const targetEid = getEntityId(target);
                    let pairId = inst.targetPairIds[targetEid];
                    if (pairId === undefined) {
                        // Allocate a pairId even before any entity holds this pair,
                        // so queries can be indexed before add() is called.
                        pairId =
                            ctx.pairFreeIds.length > 0 ? ctx.pairFreeIds.pop()! : ctx.pairNextId++;
                        inst.targetPairIds[targetEid] = pairId;
                        ctx.pairRefCount[pairId] = 0; // no entities yet
                    }
                    if (!ctx.pairQueries[pairId]) ctx.pairQueries[pairId] = [];
                    ctx.pairQueries[pairId]!.push(query);
                }
            }
        }
    }

    // Populate query with initial matching entities
    if (query.trackingGroups.length > 0) {
        const entitySparse = ctx.entityIndex.sparse;
        const entityDense = ctx.entityIndex.dense;
        const requiredInst = query.traitInstances.required;
        const forbiddenInst = query.traitInstances.forbidden;
        const orInst = query.traitInstances.or;
        const checkStaticAndRelation = (eid: number): Entity | null => {
            for (let i = 0; i < requiredInst.length; i++) {
                if (!requiredInst[i].bitSet.has(eid)) return null;
            }
            for (let i = 0; i < forbiddenInst.length; i++) {
                if (forbiddenInst[i].bitSet.has(eid)) return null;
            }
            if (orInst.length > 0) {
                let anyOr = false;
                for (let i = 0; i < orInst.length; i++) {
                    if (orInst[i].bitSet.has(eid)) {
                        anyOr = true;
                        break;
                    }
                }
                if (!anyOr) return null;
            }
            const entity = entityDense[entitySparse[eid]] as Entity;
            if (hasRelationFilters) {
                const pairArr = ctx.entityPairIds[eid];
                for (const pair of query.relationFilters!) {
                    const [relation, target] = pair;
                    if (target === '*') continue;
                    if (typeof target !== 'number') return null;
                    const inst = getTraitInstance(ctx.traitInstances, relation as unknown as Trait);
                    if (!inst || !inst.targetPairIds) return null;
                    const pairId = inst.targetPairIds[getEntityId(target)];
                    if (pairId === undefined || !pairArr || pairArr[pairId] !== 1) return null;
                }
            }
            return entity;
        };
        for (const group of query.trackingGroups) {
            const { type, id, logic, groupTraitInstances: gInstances } = group;
            const snapshot = ctx.trackingSnapshots.get(id)!;
            if (type === 'add') {
                const membershipSets = gInstances.map((inst) => inst.bitSet);
                if (membershipSets.length === 0) continue;

                if (logic === 'and') {
                    forEachIntersection(membershipSets, (eid) => {
                        if (query.entities.has(entityDense[entitySparse[eid]])) return;
                        for (let i = 0; i < gInstances.length; i++) {
                            if (snapshot.get(gInstances[i].definition.id)?.has(eid)) return;
                        }
                        const entity = checkStaticAndRelation(eid);
                        if (entity) query.add(entity);
                    });
                } else {
                    for (let i = 0; i < gInstances.length; i++) {
                        const inst = gInstances[i];
                        inst.bitSet.forEach((eid) => {
                            if (query.entities.has(entityDense[entitySparse[eid]])) return;
                            if (snapshot.get(inst.definition.id)?.has(eid)) return;
                            const entity = checkStaticAndRelation(eid);
                            if (entity) query.add(entity);
                        });
                    }
                }
            } else if (type === 'remove') {
                const removedMap = ctx.removedBitSets.get(id);
                if (!removedMap) continue;
                const removedSets: HiSparseBitSet[] = [];
                for (let i = 0; i < gInstances.length; i++) {
                    const bs = removedMap.get(gInstances[i].definition.id);
                    if (bs) removedSets.push(bs);
                }
                if (removedSets.length === 0) continue;

                if (logic === 'and') {
                    forEachIntersection(removedSets, (eid) => {
                        if (query.entities.has(entityDense[entitySparse[eid]])) return;
                        for (let i = 0; i < gInstances.length; i++) {
                            if (gInstances[i].bitSet.has(eid)) return;
                        }
                        const entity = checkStaticAndRelation(eid);
                        if (entity) query.add(entity);
                    });
                } else {
                    for (const rSet of removedSets) {
                        rSet.forEach((eid) => {
                            if (query.entities.has(entityDense[entitySparse[eid]])) return;
                            const entity = checkStaticAndRelation(eid);
                            if (entity) query.add(entity);
                        });
                    }
                }
            } else if (type === 'change') {
                const changedMap = ctx.changedBitSets.get(id);
                if (!changedMap) continue;
                const changedSets: HiSparseBitSet[] = [];
                for (let i = 0; i < gInstances.length; i++) {
                    const bs = changedMap.get(gInstances[i].definition.id);
                    if (bs) changedSets.push(bs);
                }
                if (changedSets.length === 0) continue;

                if (logic === 'and') {
                    forEachIntersection(changedSets, (eid) => {
                        if (query.entities.has(entityDense[entitySparse[eid]])) return;
                        for (let i = 0; i < gInstances.length; i++) {
                            if (!gInstances[i].bitSet.has(eid)) return;
                        }
                        const entity = checkStaticAndRelation(eid);
                        if (entity) query.add(entity);
                    });
                } else {
                    for (const cSet of changedSets) {
                        cSet.forEach((eid) => {
                            if (query.entities.has(entityDense[entitySparse[eid]])) return;
                            const entity = checkStaticAndRelation(eid);
                            if (entity) query.add(entity);
                        });
                    }
                }
            }
        }
    } else {
        // Non-tracking query: use bitset intersection for population
        const requiredInstances = query.traitInstances.required;
        const forbiddenInstances = query.traitInstances.forbidden;
        const orInstances = query.traitInstances.or;
        const hasOr = orInstances.length > 0;
        const rf = query.relationFilters;
        const hasRf = rf !== undefined && rf.length > 0;

        if (requiredInstances.length > 0) {
            const requiredSets = requiredInstances.map((inst) => inst.bitSet);
            const forbiddenSets = forbiddenInstances.map((inst) => inst.bitSet);
            const entitySparse = ctx.entityIndex.sparse;
            const entityDense = ctx.entityIndex.dense;

            forEachBitSetQuery(requiredSets, forbiddenSets, (eid) => {
                if (hasOr) {
                    let anyOr = false;
                    for (let j = 0; j < orInstances.length; j++) {
                        if (orInstances[j].bitSet.has(eid)) {
                            anyOr = true;
                            break;
                        }
                    }
                    if (!anyOr) return;
                }

                const entity = entityDense[entitySparse[eid]] as Entity;

                if (hasRf) {
                    const pairArr = ctx.entityPairIds[eid];
                    for (let j = 0; j < rf!.length; j++) {
                        const [relation, target] = rf![j];
                        if (target === '*') continue;
                        if (typeof target !== 'number') return;
                        const inst = getTraitInstance(
                            ctx.traitInstances,
                            relation as unknown as Trait
                        );
                        if (!inst || !inst.targetPairIds) return;
                        const pairId = inst.targetPairIds[getEntityId(target)];
                        if (pairId === undefined || !pairArr || pairArr[pairId] !== 1) return;
                    }
                }

                query.add(entity);
            });
        } else {
            const entities = ctx.entityIndex.dense;
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                if (query.check(world, entity)) query.add(entity);
            }
        }
    }

    return query;
}

let queryId = 0;

export function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T> {
    const hash = createQueryHash(parameters);

    // Check if this query was already cached
    const existing = universe.cachedQueries.get(hash);
    if (existing) return existing as Query<T>;

    // Create new query ref with ID
    const id = queryId++;
    const queryRef = Object.freeze({
        [$queryRef]: true,
        id,
        hash,
        parameters,
    }) as Query<T>;

    // Cache the ref for deduplication and stable IDs
    universe.cachedQueries.set(hash, queryRef);

    return queryRef;
}
