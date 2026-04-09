import { SparseSet } from '@koota/collections';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import {
    EMPTY_MASK_PAGE,
    createEmptyMaskGeneration,
    ensureMaskPage,
} from '../entity/utils/paged-mask';
import { getEntitiesWithRelationTo, hasRelationPair } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait } from '../trait/types';
import { universe } from '../universe/universe';
import type { WorldInternal } from '../world';
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
    type ResolvedRelationFilter,
    type QuerySubscriber,
    type TrackingGroup,
} from './types';
import { checkQuery } from './utils/check-query';
import { checkQueryTracking } from './utils/check-query-tracking';
import { checkQueryWithRelations } from './utils/check-query-with-relations';
import { createQueryHash } from './utils/create-query-hash';
import { isQuery } from './utils/is-query';

export const IsExcluded: TagTrait = trait();

function resolveRelationFilter(filter: ResolvedRelationFilter): ResolvedRelationFilter {
    if (!filter.targetQuery) return filter;

    const targetQueryRef = isQuery(filter.targetQuery)
        ? filter.targetQuery
        : createQuery(...filter.targetQuery);

    return {
        ...filter,
        targetQueryRef,
        targetQueryMatches: new SparseSet(),
    };
}

export function runQuery<T extends QueryParameter[]>(
    ctx: WorldInternal,
    query: QueryInstance<T>,
    params: QueryParameter[]
): QueryResult<T> {
    commitQueryRemovals(ctx);

    const entities = query.entities.dense.slice() as Entity[];

    if (query.isTracking) {
        query.entities.clear();
        const len = entities.length;
        for (let i = 0; i < len; i++) {
            query.resetTrackingBitmasks(getEntityId(entities[i]));
        }
    }

    return createQueryResult(ctx, entities, query, params);
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
    query.toRemove.remove(entity);
    query.entities.add(entity);

    for (const sub of query.addSubscriptions) {
        sub(entity);
    }

    query.version++;
}

export function removeEntityFromQuery(ctx: WorldInternal, query: QueryInstance, entity: Entity) {
    if (!query.entities.has(entity) || query.toRemove.has(entity)) return;

    query.toRemove.add(entity);
    ctx.dirtyQueries.add(query);

    for (const sub of query.removeSubscriptions) {
        sub(entity);
    }

    query.version++;
}

export function commitQueryRemovals(ctx: WorldInternal) {
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

export function resetQueryTrackingBitmasks(query: QueryInstance, eid: number) {
    const groups = query.trackingGroups;
    const len = groups.length;
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    for (let i = 0; i < len; i++) {
        const trackers = groups[i].trackers;
        const trackersLen = trackers.length;
        for (let j = 0; j < trackersLen; j++) {
            const page = trackers[j][pageId];
            if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
        }
    }
}

function processTrackingModifier(
    ctx: WorldInternal,
    query: QueryInstance,
    modifier: Modifier,
    logic: 'and' | 'or',
    groupsMap: Map<string, TrackingGroup>
): void {
    const trackingType = getTrackingType(modifier);
    if (!trackingType) return;

    const id = modifier.id;
    const key = `${trackingType}-${id}-${logic}`;

    let group = groupsMap.get(key);
    if (!group) {
        group = {
            logic,
            type: trackingType,
            id,
            bitmasks: [],
            trackers: [],
        };
        groupsMap.set(key, group);
        query.trackingGroups.push(group);
    }

    for (const trait of modifier.traits) {
        if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
        const instance = getTraitInstance(ctx.traitInstances, trait)!;
        query.traits.push(trait);

        query.traitInstances.all.push(instance);

        const genId = instance.generationId;
        group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;

        if (trackingType === 'change') {
            query.changedTraits.add(trait);
            query.hasChangedModifiers = true;
        }
    }

    query.isTracking = true;
}

export function createQueryInstance<T extends QueryParameter[]>(
    ctx: WorldInternal,
    parameters: T
): QueryInstance {
    const query: QueryInstance = {
        version: 0,
        ctx,
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
        cleanup: [],
        addSubscriptions: new Set<QuerySubscriber>(),
        removeSubscriptions: new Set<QuerySubscriber>(),
        relationFilters: [],

        run: (ctx: WorldInternal, params: QueryParameter[]) => runQuery(ctx, query, params),
        add: (entity: Entity) => addEntityToQuery(query, entity),
        remove: (ctx: WorldInternal, entity: Entity) => removeEntityFromQuery(ctx, query, entity),
        check: (ctx: WorldInternal, entity: Entity) => checkQuery(ctx, query, entity),
        checkTracking: (
            ctx: WorldInternal,
            entity: Entity,
            eventType: EventType,
            generationId: number,
            bitflag: number
        ) => checkQueryTracking(ctx, query, entity, eventType, generationId, bitflag),
        resetTrackingBitmasks: (eid: number) => resetQueryTrackingBitmasks(query, eid),
    };

    const trackingGroupsMap = new Map<string, TrackingGroup>();

    for (let i = 0; i < parameters.length; i++) {
        const parameter = parameters[i];

        if (isRelationPair(parameter)) {
            const relation = parameter.relation;
            query.relationFilters!.push(resolveRelationFilter(parameter));

            const baseTrait = (relation as Relation<Trait>)[$internal].trait;
            if (!hasTraitInstance(ctx.traitInstances, baseTrait)) registerTrait(ctx, baseTrait);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, baseTrait)!);
            query.traits.push(baseTrait);

            continue;
        }

        if (isModifier(parameter)) {
            const traits = parameter.traits;

            for (let j = 0; j < traits.length; j++) {
                const t = traits[j];
                if (!hasTraitInstance(ctx.traitInstances, t)) registerTrait(ctx, t);
            }

            if (parameter.type === 'not') {
                query.traitInstances.forbidden.push(
                    ...traits.map((t) => getTraitInstance(ctx.traitInstances, t)!)
                );
            } else if (parameter.type === 'or') {
                query.traitInstances.or.push(
                    ...traits.map((t) => getTraitInstance(ctx.traitInstances, t)!)
                );

                if (isOrWithModifiers(parameter)) {
                    for (const nestedModifier of parameter.modifiers) {
                        if (isTrackingModifier(nestedModifier)) {
                            processTrackingModifier(
                                ctx,
                                query,
                                nestedModifier,
                                'or',
                                trackingGroupsMap
                            );
                        }
                    }
                }
            } else if (isTrackingModifier(parameter)) {
                processTrackingModifier(ctx, query, parameter, 'and', trackingGroupsMap);
            }
        } else {
            const t = parameter as Trait;
            if (!hasTraitInstance(ctx.traitInstances, t)) registerTrait(ctx, t);
            query.traitInstances.required.push(getTraitInstance(ctx.traitInstances, t)!);
            query.traits.push(t);
        }
    }

    query.traitInstances.forbidden.push(getTraitInstance(ctx.traitInstances, IsExcluded)!);

    query.traitInstances.all = [
        ...query.traitInstances.all,
        ...query.traitInstances.required,
        ...query.traitInstances.forbidden,
        ...query.traitInstances.or,
    ];

    query.generations = query.traitInstances.all
        .map((c) => c.generationId)
        .reduce((a: number[], v) => {
            if (a.includes(v)) return a;
            a.push(v);
            return a;
        }, []);

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

    query.hash = createQueryHash(parameters);

    ctx.queriesHashMap.set(query.hash, query);

    if (query.isTracking) {
        query.traitInstances.all.forEach((instance) => {
            instance.trackingQueries.add(query);
        });
    } else {
        query.traitInstances.all.forEach((instance) => {
            instance.queries.add(query);
        });
    }

    if (query.traitInstances.forbidden.length > 0) ctx.notQueries.add(query);

    const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;

    if (hasRelationFilters) {
        const world = ctx.world;
        for (const pair of query.relationFilters!) {
            const relationTrait = pair.relation[$internal].trait;
            const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
            if (relationTraitInstance) {
                relationTraitInstance.relationQueries.add(query);
            }

            if (pair.targetQueryRef && pair.targetQueryMatches) {
                const matchingTargets = world.query(pair.targetQueryRef);
                for (let i = 0; i < matchingTargets.length; i++) {
                    pair.targetQueryMatches.add(matchingTargets[i]);
                }

                const refreshSourcesForTarget = (target: Entity) => {
                    const sources = getEntitiesWithRelationTo(
                        ctx,
                        pair.relation as Relation<Trait>,
                        target
                    );
                    for (let i = 0; i < sources.length; i++) {
                        const source = sources[i];
                        const match = checkQueryWithRelations(ctx, query, source);
                        if (match) {
                            query.add(source);
                        } else {
                            query.remove(ctx, source);
                        }
                    }
                };

                query.cleanup.push(
                    world.onQueryAdd(pair.targetQueryRef, (target) => {
                        pair.targetQueryMatches!.add(target);
                        refreshSourcesForTarget(target);
                    })
                );
                query.cleanup.push(
                    world.onQueryRemove(pair.targetQueryRef, (target) => {
                        pair.targetQueryMatches!.remove(target);
                        refreshSourcesForTarget(target);
                    })
                );
            }
        }
    }

    if (query.trackingGroups.length > 0) {
        for (const group of query.trackingGroups) {
            const { type, id, logic, bitmasks } = group;
            const snapshot = ctx.trackingSnapshots.get(id)!;
            const dirtyMask = ctx.dirtyMasks.get(id)!;
            const changedMask = ctx.changedMasks.get(id)!;

            for (const entity of ctx.entityIndex.dense) {
                if (query.entities.has(entity)) continue;

                const eid = getEntityId(entity);
                let matches = logic === 'and';

                for (let genId = 0; genId < bitmasks.length; genId++) {
                    const mask = bitmasks[genId];
                    if (!mask) continue;

                    const pageId = eid >>> 10;
                    const offset = eid & 1023;
                    const oldMask = snapshot[genId][pageId][offset];
                    const currentMask = ctx.entityMasks[genId][pageId][offset];

                    for (let bit = 1; bit <= mask; bit <<= 1) {
                        if (!(mask & bit)) continue;

                        let traitMatches = false;

                        switch (type) {
                            case 'add':
                                traitMatches = (oldMask & bit) === 0 && (currentMask & bit) === bit;
                                break;
                            case 'remove':
                                traitMatches =
                                    ((oldMask & bit) === bit && (currentMask & bit) === 0) ||
                                    ((oldMask & bit) === 0 &&
                                        (currentMask & bit) === 0 &&
                                        (dirtyMask[genId][pageId][offset] & bit) === bit);
                                break;
                            case 'change':
                                traitMatches = (changedMask[genId][pageId][offset] & bit) === bit;
                                break;
                        }

                        if (logic === 'and') {
                            if (!traitMatches) {
                                matches = false;
                                break;
                            }
                        } else {
                            if (traitMatches) {
                                matches = true;
                                break;
                            }
                        }
                    }

                    if (logic === 'and' && !matches) break;
                    if (logic === 'or' && matches) break;
                }

                if (matches) {
                    if (hasRelationFilters) {
                        let relationMatch = true;
                        for (const pair of query.relationFilters!) {
                            if (!hasRelationPair(ctx, entity, pair)) {
                                relationMatch = false;
                                break;
                            }
                        }
                        if (relationMatch) query.add(entity);
                    } else {
                        query.add(entity);
                    }
                }
            }
        }
    } else {
        const entities = ctx.entityIndex.dense;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const match = hasRelationFilters
                ? checkQueryWithRelations(ctx, query, entity)
                : query.check(ctx, entity);
            if (match) query.add(entity);
        }
    }

    return query;
}

let queryId = 0;

export function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T> {
    const hash = createQueryHash(parameters);

    const existing = universe.cachedQueries.get(hash);
    if (existing) return existing as Query<T>;

    const id = queryId++;
    const queryRef = Object.freeze({
        [$queryRef]: true,
        id,
        hash,
        parameters,
    }) as Query<T>;

    universe.cachedQueries.set(hash, queryRef);

    return queryRef;
}
