import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait } from '../trait/types';
import { isPairPattern } from '../trait/utils/is-relation';
import { universe } from '../universe/universe';
import { SparseSet } from '../utils/sparse-set';
import { HiSparseBitSet } from '../utils/hi-sparse-bitset';
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
            groupTraits: [],
            trackerBitSets: [],
            bitmasks: [],
            trackers: [],
        };
        groupsMap.set(key, group);
        query.trackingGroups.push(group);
    }

    // Register traits and build bitmasks + trackerBitSets
    for (const trait of modifier.traits) {
        if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
        const instance = getTraitInstance(ctx.traitInstances, trait)!;
        query.traits.push(trait);

        // Add to traitInstances.all for query registration
        query.traitInstances.all.push(instance);

        // Add trait and its tracker bitset to the group
        group.groupTraits.push(trait);
        group.trackerBitSets.push(new HiSparseBitSet());

        // Legacy: build bitmasks by generation (kept during migration)
        const genId = instance.generationId;
        group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;

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
        staticBitmasks: [],
        trackingGroups: [],
        generations: [],
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

    // Create an array of all trait generations
    query.generations = query.traitInstances.all
        .map((c) => c.generationId)
        .reduce((a: number[], v) => {
            if (a.includes(v)) return a;
            a.push(v);
            return a;
        }, []);

    // Create static bitmasks (required/forbidden/or only - tracking is in trackingGroups)
    query.staticBitmasks = query.generations.map((generationId) => {
        const required = query.traitInstances.required
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const forbidden = query.traitInstances.forbidden
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const or = query.traitInstances.or
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        return { required, forbidden, or };
    });

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
        // For tracking queries, check each entity against tracking groups using bitset maps
        for (const group of query.trackingGroups) {
            const { type, id, logic, groupTraits } = group;
            const snapshotMap = ctx.trackingSnapshots.get(id);
            const addedMap = ctx.addedBitSets.get(id);
            const removedMap = ctx.removedBitSets.get(id);
            const changedMap = ctx.changedBitSets.get(id);

            // For each trait in the group, find candidate entities via bitset events
            for (let ti = 0; ti < groupTraits.length; ti++) {
                const groupTrait = groupTraits[ti];
                const traitId = groupTrait.id;
                const traitInst = getTraitInstance(ctx.traitInstances, groupTrait);

                let candidateBitSet: HiSparseBitSet | undefined;

                switch (type) {
                    case 'add': {
                        // Added: entity has trait now AND didn't have it at snapshot time
                        candidateBitSet = addedMap?.get(traitId);
                        break;
                    }
                    case 'remove': {
                        // Removed: entity was removed since tracking started
                        candidateBitSet = removedMap?.get(traitId);
                        break;
                    }
                    case 'change': {
                        // Changed: entity had trait changed since tracking started
                        candidateBitSet = changedMap?.get(traitId);
                        break;
                    }
                }

                if (!candidateBitSet) continue;

                candidateBitSet.forEach((eid) => {
                    const entity = eid as Entity;
                    if (query.entities.has(entity)) return;

                    let traitMatches = false;

                    switch (type) {
                        case 'add': {
                            // Entity must have the trait now and NOT have had it at snapshot
                            const hasTrNow = traitInst ? traitInst.bitSet.has(eid) : false;
                            const snapshotBs = snapshotMap?.get(traitId);
                            const hadAtSnapshot = snapshotBs ? snapshotBs.has(eid) : false;
                            traitMatches = hasTrNow && !hadAtSnapshot;
                            break;
                        }
                        case 'remove': {
                            // Entity must NOT have the trait now
                            const hasTrNow2 = traitInst ? traitInst.bitSet.has(eid) : false;
                            traitMatches = !hasTrNow2;
                            break;
                        }
                        case 'change': {
                            // Entity must still have the trait
                            const hasTrNow3 = traitInst ? traitInst.bitSet.has(eid) : false;
                            traitMatches = hasTrNow3;
                            break;
                        }
                    }

                    if (!traitMatches) return;

                    if (logic === 'or') {
                        // OR: any trait match suffices — check static constraints then add
                        if (query.check(world, entity)) {
                            // Pair filter
                            if (hasRelationFilters) {
                                const pairArr = ctx.entityPairIds[eid];
                                for (const pair of query.relationFilters!) {
                                    const [relation, target] = pair;
                                    if (target === '*') continue;
                                    if (typeof target !== 'number') return;
                                    const inst = getTraitInstance(
                                        ctx.traitInstances,
                                        relation as unknown as Trait
                                    );
                                    if (!inst || !inst.targetPairIds) return;
                                    const pairId = inst.targetPairIds[getEntityId(target)];
                                    if (pairId === undefined || !pairArr || pairArr[pairId] !== 1)
                                        return;
                                }
                            }
                            query.add(entity);
                        }
                    } else {
                        // AND: all traits in group must match — mark tracker and check later
                        group.trackerBitSets[ti].insert(eid);
                    }
                });
            }

            // For AND groups, now check which entities have all trackers satisfied
            if (logic === 'and' && groupTraits.length > 0) {
                const firstTracker = group.trackerBitSets[0];
                firstTracker.forEach((eid) => {
                    const entity = eid as Entity;
                    if (query.entities.has(entity)) return;

                    // Check all other trackers
                    for (let t = 1; t < group.trackerBitSets.length; t++) {
                        if (!group.trackerBitSets[t].has(eid)) return;
                    }

                    // Check static constraints
                    if (!query.check(world, entity)) return;

                    // Pair filter
                    if (hasRelationFilters) {
                        const pairArr = ctx.entityPairIds[eid];
                        for (const pair of query.relationFilters!) {
                            const [relation, target] = pair;
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
            }
        }
    } else {
        // Non-tracking query: populate immediately
        // checkQuery now handles relation filters internally
        const entities = ctx.entityIndex.dense;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (query.check(world, entity)) query.add(entity);
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
