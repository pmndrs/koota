import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait, TraitInstance } from '../trait/types';
import { universe } from '../universe/universe';
import { SparseSet } from '../utils/sparse-set';
import type { World } from '../world';
import { getTrackingType, isModifier, isOrWithModifiers, isTrackingModifier } from './modifier';
import { createQueryResult } from './query-result';
import { $queryRef } from './symbols';
import {
    type EventType,
    type Modifier,
    type OrTrackingGroup,
    type Query,
    type QueryInstance,
    type QueryParameter,
    type QueryResult,
    type QuerySubscriber,
} from './types';
import { checkQuery } from './utils/check-query';
import { checkQueryTracking } from './utils/check-query-tracking';
import { checkQueryWithRelations } from './utils/check-query-with-relations';
import { createQueryHash } from './utils/create-query-hash';

export const IsExcluded: TagTrait = trait();

export function runQuery<T extends QueryParameter[]>(
    world: World,
    query: QueryInstance<T>,
    params: QueryParameter[]
): QueryResult<T> {
    commitQueryRemovals(world);

    // With hybrid bitmask strategy, query.entities is already incrementally maintained
    // with both trait and relation filters applied. Just return the pre-filtered entities.
    const entities = query.entities.dense.slice() as Entity[];

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
        for (let i = query.toRemove.dense.length - 1; i >= 0; i--) {
            const eid = query.toRemove.dense[i];
            query.toRemove.remove(eid);
            query.entities.remove(eid);
        }
    }

    ctx.dirtyQueries.clear();
}

/** PERF: Use indexed loop instead of for...of for better V8 optimization */
export function resetQueryTrackingBitmasks(query: QueryInstance, eid: number) {
    const bitmasks = query.bitmasks;
    const len = bitmasks.length;
    for (let i = 0; i < len; i++) {
        const bitmask = bitmasks[i];
        bitmask.addedTracker[eid] = 0;
        bitmask.removedTracker[eid] = 0;
        bitmask.changedTracker[eid] = 0;
    }
}

/**
 * Process tracking modifiers nested inside an Or modifier.
 * Creates OrTrackingGroups that use OR semantics (entity matches if ANY condition is met).
 */
function processOrTrackingModifiers(
    world: World,
    query: QueryInstance,
    modifiers: Modifier[],
    ctx: World[typeof $internal]
): void {
    // Group modifiers by their tracking ID
    const groupsByType = new Map<string, OrTrackingGroup>();

    for (const modifier of modifiers) {
        if (!isTrackingModifier(modifier)) continue;

        const trackingType = getTrackingType(modifier);
        if (!trackingType) continue;

        const id = modifier.id;
        const key = `${trackingType}-${id}`;

        // Get or create the group for this tracking type and ID
        let group = groupsByType.get(key);
        if (!group) {
            group = {
                type: trackingType,
                id,
                traitInstances: [],
                // PERF: Use sparse array instead of Map for O(1) indexed access
                bitmasksByGeneration: [],
            };
            groupsByType.set(key, group);
            query.orTrackingGroups.push(group);
        }

        // Register and add traits from this modifier to the group
        for (const trait of modifier.traits) {
            if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
            const instance = getTraitInstance(ctx.traitInstances, trait)!;
            group.traitInstances.push(instance);
            query.traits.push(trait);

            // Build bitmasks by generation for efficient OR checking
            // PERF: Array access is faster than Map.get()
            const genId = instance.generationId;
            group.bitmasksByGeneration[genId] = (group.bitmasksByGeneration[genId] || 0) | instance.bitflag;

            // Track changed traits for change detection
            if (trackingType === 'change') {
                query.changedTraits.add(trait);
                query.hasChangedModifiers = true;
            }
        }
    }

    // Mark query as tracking if we have any or-tracking groups
    if (query.orTrackingGroups.length > 0) {
        query.isTracking = true;
    }
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
            added: [],
            removed: [],
            changed: [],
            all: [],
        },
        bitmasks: [],
        generations: [],
        entities: new SparseSet(),
        isTracking: false,
        hasChangedModifiers: false,
        changedTraits: new Set<Trait>(),
        toRemove: new SparseSet(),
        addSubscriptions: new Set<QuerySubscriber>(),
        removeSubscriptions: new Set<QuerySubscriber>(),
        relationFilters: [],
        orTrackingGroups: [],

        run: (world: World, params: QueryParameter[]) => runQuery(world, query, params),
        add: (entity: Entity) => addEntityToQuery(query, entity),
        remove: (world: World, entity: Entity) => removeEntityFromQuery(world, query, entity),
        check: (world: World, entity: Entity) => checkQuery(world, query, entity),
        checkTracking: (
            world: World,
            entity: Entity,
            eventType: EventType,
            generationId: number,
            bitflag: number
        ) => checkQueryTracking(world, query, entity, eventType, generationId, bitflag),
        resetTrackingBitmasks: (eid: number) => resetQueryTrackingBitmasks(query, eid),
    };

    const ctx = world[$internal];

    // Initialize tracking parameters.
    const trackingParams: {
        type: 'add' | 'remove' | 'change';
        id: number;
        traits: TraitInstance[];
    }[] = [];

    // Iterate over the parameters and run any modifiers.
    // Sort into traits and not-traits.
    for (let i = 0; i < parameters.length; i++) {
        const parameter = parameters[i];

        // Handle relation pairs
        if (isRelationPair(parameter)) {
            const pairCtx = parameter[$internal];
            const relation = pairCtx.relation;

            // Cache relation pairs for queriess
            query.relationFilters!.push(parameter);

            // Add the base trait as required
            const baseTrait = (relation as Relation<Trait>)[$internal].trait;
            if (!hasTraitInstance(ctx.traitInstances, baseTrait)) registerTrait(world, baseTrait);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, baseTrait)!);
            query.traits.push(baseTrait);

            continue;
        }

        if (isModifier(parameter)) {
            const traits = parameter.traits;

            // Register traits if they don't exist.
            for (let j = 0; j < traits.length; j++) {
                const trait = traits[j];
                if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
            }

            if (parameter.type === 'not') {
                query.traitInstances.forbidden.push(
                    ...traits.map((trait) => getTraitInstance(ctx.traitInstances, trait)!)
                );
            }

            if (parameter.type === 'or') {
                // Handle regular traits in Or
                query.traitInstances.or.push(
                    ...traits.map((trait) => getTraitInstance(ctx.traitInstances, trait)!)
                );

                // Handle nested modifiers in Or (e.g., Or(Changed(A), Changed(B)))
                if (isOrWithModifiers(parameter)) {
                    processOrTrackingModifiers(world, query, parameter.modifiers, ctx);
                }
            }

            if (parameter.type.includes('added')) {
                for (const trait of traits) {
                    const data = getTraitInstance(ctx.traitInstances, trait)!;
                    query.traitInstances.added.push(data);
                    query.traits.push(trait);
                }

                query.isTracking = true;

                const id = parameter.type.split('-')[1];
                trackingParams.push({
                    type: 'add',
                    id: parseInt(id),
                    traits: query.traitInstances.added,
                });
            }

            if (parameter.type.includes('removed')) {
                for (const trait of traits) {
                    const data = getTraitInstance(ctx.traitInstances, trait)!;
                    query.traitInstances.removed.push(data);
                    query.traits.push(trait);
                }

                query.isTracking = true;

                const id = parameter.type.split('-')[1];
                trackingParams.push({
                    type: 'remove',
                    id: parseInt(id),
                    traits: query.traitInstances.removed,
                });
            }

            if (parameter.type.includes('changed')) {
                for (const trait of traits) {
                    query.changedTraits.add(trait);
                    const data = getTraitInstance(ctx.traitInstances, trait)!;
                    query.traitInstances.changed.push(data);
                    query.traits.push(trait);
                    query.hasChangedModifiers = true;
                }

                query.isTracking = true;

                const id = parameter.type.split('-')[1];
                trackingParams.push({
                    type: 'change',
                    id: parseInt(id),
                    traits: query.traitInstances.changed,
                });
            }
        } else {
            const trait = parameter as Trait;
            if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, trait)!);
            query.traits.push(trait);
        }
    }

    // Add IsExcluded to the forbidden list.
    query.traitInstances.forbidden.push(getTraitInstance(ctx.traitInstances, IsExcluded)!);

    // Collect trait instances from orTrackingGroups
    const orTrackingInstances = query.orTrackingGroups.flatMap((g) => g.traitInstances);

    query.traitInstances.all = [
        ...query.traitInstances.required,
        ...query.traitInstances.forbidden,
        ...query.traitInstances.or,
        ...query.traitInstances.added,
        ...query.traitInstances.removed,
        ...query.traitInstances.changed,
        ...orTrackingInstances,
    ];

    // Create an array of all trait generations.
    query.generations = query.traitInstances.all
        .map((c) => c.generationId)
        .reduce((a: number[], v) => {
            if (a.includes(v)) return a;
            a.push(v);
            return a;
        }, []);

    // Create bitmasks.
    query.bitmasks = query.generations.map((generationId) => {
        const required = query.traitInstances.required
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const forbidden = query.traitInstances.forbidden
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const or = query.traitInstances.or
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const added = query.traitInstances.added
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const removed = query.traitInstances.removed
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        const changed = query.traitInstances.changed
            .filter((c) => c.generationId === generationId)
            .reduce((a, c) => a | c.bitflag, 0);

        return {
            required: required | added,
            forbidden,
            or,
            added,
            removed,
            changed,
            addedTracker: [],
            removedTracker: [],
            changedTracker: [],
        };
    });

    // Create hash.
    query.hash = createQueryHash(parameters);

    // Add it to world.
    ctx.queriesHashMap.set(query.hash, query);

    // Add query to each trait instance, sorted by tracking status
    if (query.isTracking) {
        query.traitInstances.all.forEach((instance) => {
            instance.trackingQueries.add(query);
        });
    } else {
        query.traitInstances.all.forEach((instance) => {
            instance.queries.add(query);
        });
    }

    // Add query instance to the world's not-query store.
    if (query.traitInstances.forbidden.length > 0) ctx.notQueries.add(query);

    // Index queries with relation filters by their relations
    const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;

    if (hasRelationFilters) {
        for (const pair of query.relationFilters!) {
            // Add to this specific relation's relationQueries
            const relationTrait = pair[$internal].relation[$internal].trait;
            const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
            if (relationTraitInstance) {
                relationTraitInstance.relationQueries.add(query);
            }
        }
    }

    // Populate the query with tracking parameters.
    const hasTrackingParams = trackingParams.length > 0;
    const hasOrTracking = query.orTrackingGroups.length > 0;

    if (hasTrackingParams || hasOrTracking) {
        // Process regular tracking params (AND logic)
        for (let i = 0; i < trackingParams.length; i++) {
            const type = trackingParams[i].type;
            const id = trackingParams[i].id;
            const traits = trackingParams[i].traits;
            const snapshot = ctx.trackingSnapshots.get(id)!;
            const dirtyMask = ctx.dirtyMasks.get(id)!;
            const changedMask = ctx.changedMasks.get(id)!;

            for (const entity of ctx.entityIndex.dense) {
                let allTraitsMatch = true;
                const eid = getEntityId(entity);

                for (const trait of traits) {
                    const { generationId, bitflag } = trait;
                    const oldMask = snapshot[generationId]?.[eid] || 0;
                    const currentMask = ctx.entityMasks[generationId]?.[eid] || 0;

                    let traitMatches = false;

                    switch (type) {
                        case 'add':
                            traitMatches =
                                (oldMask & bitflag) === 0 && (currentMask & bitflag) === bitflag;
                            break;
                        case 'remove':
                            traitMatches =
                                ((oldMask & bitflag) === bitflag && (currentMask & bitflag) === 0) ||
                                ((oldMask & bitflag) === 0 &&
                                    (currentMask & bitflag) === 0 &&
                                    ((dirtyMask[generationId]?.[eid] ?? 0) & bitflag) === bitflag);
                            break;
                        case 'change':
                            traitMatches =
                                ((changedMask[generationId]?.[eid] ?? 0) & bitflag) === bitflag;
                            break;
                    }

                    if (!traitMatches) {
                        allTraitsMatch = false;
                        break; // No need to check other traits if one doesn't match
                    }
                }

                if (allTraitsMatch) {
                    query.add(entity);
                }
            }
        }

        // Process or-tracking groups (OR logic - entity matches if ANY trait matches)
        for (const group of query.orTrackingGroups) {
            const { type, id, traitInstances } = group;
            const snapshot = ctx.trackingSnapshots.get(id)!;
            const dirtyMask = ctx.dirtyMasks.get(id)!;
            const changedMask = ctx.changedMasks.get(id)!;

            for (const entity of ctx.entityIndex.dense) {
                // Skip if already in query
                if (query.entities.has(entity)) continue;

                const eid = getEntityId(entity);
                let anyTraitMatches = false;

                for (const trait of traitInstances) {
                    const { generationId, bitflag } = trait;
                    const oldMask = snapshot[generationId]?.[eid] || 0;
                    const currentMask = ctx.entityMasks[generationId]?.[eid] || 0;

                    let traitMatches = false;

                    switch (type) {
                        case 'add':
                            traitMatches =
                                (oldMask & bitflag) === 0 && (currentMask & bitflag) === bitflag;
                            break;
                        case 'remove':
                            traitMatches =
                                ((oldMask & bitflag) === bitflag && (currentMask & bitflag) === 0) ||
                                ((oldMask & bitflag) === 0 &&
                                    (currentMask & bitflag) === 0 &&
                                    ((dirtyMask[generationId]?.[eid] ?? 0) & bitflag) === bitflag);
                            break;
                        case 'change':
                            traitMatches =
                                ((changedMask[generationId]?.[eid] ?? 0) & bitflag) === bitflag;
                            break;
                    }

                    if (traitMatches) {
                        anyTraitMatches = true;
                        break; // OR logic: one match is enough
                    }
                }

                if (anyTraitMatches) {
                    query.add(entity);
                }
            }
        }
    } else {
        // Populate the query immediately.
        const entities = ctx.entityIndex.dense;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            // Use checkQueryWithRelations if query has relation filters, otherwise use checkQuery
            const match = hasRelationFilters
                ? checkQueryWithRelations(world, query, entity)
                : query.check(world, entity);
            if (match) query.add(entity);
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
