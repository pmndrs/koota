import { createSparseSet, addSparse, removeSparse, hasSparse, clearSparse } from '@koota/collections';
import { $internal } from '../common';
import { notifyQuery } from '../commands/lifecycle';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/pack-entity';
import { EMPTY_MASK_PAGE } from '../entity/paged-mask';
import { getEntitiesWithRelationTo, hasRelationPair } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/is-relation';
import { registerTrait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait';
import type { Trait } from '../trait/types';
import { universe } from '../universe';
import type { KernelContext } from '../context';
import { getTrackingType, isModifier, isOrWithModifiers, isTrackingModifier } from './modifier';
import { $queryRef } from './symbols';
import {
  type EventType,
  type Modifier,
  type Query,
  type QueryInstance,
  type QueryParameter,
  type QuerySubscriber,
  type ResolvedRelationFilter,
  type TrackingGroup,
} from './types';
import { checkQuery } from './check-query';
import { checkQueryTracking } from './check-query-tracking';
import { checkQueryWithRelations } from './check-query-with-relations';
import { createQueryHash } from './create-query-hash';
import { isQuery } from './is-query';

function resolveRelationFilter(filter: ResolvedRelationFilter): ResolvedRelationFilter {
  if (!filter.targetQuery) return filter;

  const targetQueryRef = isQuery(filter.targetQuery)
    ? filter.targetQuery
    : createQuery(...filter.targetQuery);

  return {
    ...filter,
    targetQueryRef,
    targetQueryMatches: createSparseSet(),
  };
}

export function runQuery<T extends QueryParameter[]>(
  ctx: KernelContext,
  query: QueryInstance<T>
): Entity[] {
  commitQueryRemovals(ctx);

  const entities = query.entities.dense.slice() as Entity[];

  if (query.isTracking) {
    clearSparse(query.entities);
    const len = entities.length;
    for (let i = 0; i < len; i++) {
      query.resetTrackingBitmasks(getEntityId(entities[i]));
    }
  }

  return entities;
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
  removeSparse(query.toRemove, entity);
  addSparse(query.entities, entity);

  query.version++;
  for (const sub of query.internalAddSubscriptions) sub(entity);
  notifyQuery(query.ctx, query.addSubscriptions, entity);
}

export function removeEntityFromQuery(ctx: KernelContext, query: QueryInstance, entity: Entity) {
  if (!hasSparse(query.entities, entity) || hasSparse(query.toRemove, entity)) return;

  addSparse(query.toRemove, entity);
  ctx.dirtyQueries.add(query);

  query.version++;
  for (const sub of query.internalRemoveSubscriptions) sub(entity);
  notifyQuery(ctx, query.removeSubscriptions, entity);
}

export function commitQueryRemovals(ctx: KernelContext) {
  if (!ctx.dirtyQueries.size) return;

  for (const query of ctx.dirtyQueries) {
    for (let i = query.toRemove.dense.length - 1; i >= 0; i--) {
      const eid = query.toRemove.dense[i];
      removeSparse(query.toRemove, eid);
      removeSparse(query.entities, eid);
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
  ctx: KernelContext,
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
  ctx: KernelContext,
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
    entities: createSparseSet(),
    isTracking: false,
    hasChangedModifiers: false,
    changedTraits: new Set<Trait>(),
    toRemove: createSparseSet(),
    cleanup: [],
    addSubscriptions: new Set<QuerySubscriber>(),
    removeSubscriptions: new Set<QuerySubscriber>(),
    internalAddSubscriptions: new Set<QuerySubscriber>(),
    internalRemoveSubscriptions: new Set<QuerySubscriber>(),
    layoutCache: null,
    relationFilters: [],

    run: (ctx: KernelContext) => runQuery(ctx, query),
    add: (entity: Entity) => addEntityToQuery(query, entity),
    remove: (ctx: KernelContext, entity: Entity) => removeEntityFromQuery(ctx, query, entity),
    check: (ctx: KernelContext, entity: Entity) => checkQuery(ctx, query, entity),
    checkTracking: (
      ctx: KernelContext,
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
        query.traitInstances.or.push(...traits.map((t) => getTraitInstance(ctx.traitInstances, t)!));

        if (isOrWithModifiers(parameter)) {
          for (const nestedModifier of parameter.modifiers) {
            if (isTrackingModifier(nestedModifier)) {
              processTrackingModifier(ctx, query, nestedModifier, 'or', trackingGroupsMap);
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

  if (ctx.queryExclusions) {
    for (const trait of ctx.queryExclusions) {
      if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
      query.traitInstances.forbidden.push(getTraitInstance(ctx.traitInstances, trait)!);
    }
  }

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

  if (query.traitInstances.forbidden.length > 0 || query.traitInstances.all.length === 0) {
    ctx.notQueries.add(query);
  }

  const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;

  if (hasRelationFilters) {
    for (const pair of query.relationFilters!) {
      const relationTrait = pair.relation[$internal].trait;
      const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
      if (relationTraitInstance) {
        relationTraitInstance.relationQueries.add(query);
      }

      if (pair.targetQueryRef && pair.targetQueryMatches) {
        const matchingTargets = queryInternal(ctx, pair.targetQueryRef);
        for (let i = 0; i < matchingTargets.length; i++) {
          addSparse(pair.targetQueryMatches, matchingTargets[i]);
        }

        const refreshSourcesForTarget = (target: Entity) => {
          const sources = getEntitiesWithRelationTo(ctx, pair.relation as Relation<Trait>, target);
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
          subscribeQueryAdd(ctx, pair.targetQueryRef, (target) => {
            addSparse(pair.targetQueryMatches!, target);
            refreshSourcesForTarget(target);
          })
        );
        query.cleanup.push(
          subscribeQueryRemove(ctx, pair.targetQueryRef, (target) => {
            removeSparse(pair.targetQueryMatches!, target);
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
        if (hasSparse(query.entities, entity)) continue;

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
    for (let i = 0; i < ctx.entityIndex.aliveCount; i++) {
      const entity = entities[i];
      const match = hasRelationFilters
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
      if (match) query.add(entity);
    }
  }

  return query;
}

/**
 * Resolve or create a QueryInstance for the given parameters.
 */
export function resolveQueryInstance(ctx: KernelContext, params: QueryParameter[]): QueryInstance {
  const hash = createQueryHash(params);
  let query = ctx.queriesHashMap.get(hash);
  if (!query) {
    query = createQueryInstance(ctx, params);
    ctx.queriesHashMap.set(hash, query);
  }
  return query;
}

/**
 * Resolve a QueryInstance from a Query ref (fast path via id).
 */
export function resolveQueryInstanceFromRef(
  ctx: KernelContext,
  queryRef: Query<QueryParameter[]>
): QueryInstance {
  let query = ctx.queryInstances[queryRef.id];
  if (query) return query;

  query = ctx.queriesHashMap.get(queryRef.hash);
  if (!query) {
    query = createQueryInstance(ctx, queryRef.parameters);
    ctx.queriesHashMap.set(queryRef.hash, query);
    if (queryRef.id >= ctx.queryInstances.length) {
      ctx.queryInstances.length = queryRef.id + 1;
    }
    ctx.queryInstances[queryRef.id] = query;
  }
  return query;
}

/**
 * Resolve and run a query against a kernel context.
 */
export function queryInternal<T extends QueryParameter[]>(
  ctx: KernelContext,
  ...args: [Query<T>] | T
): Entity[] {
  if (args.length === 1 && isQuery(args[0])) {
    const instance = resolveQueryInstanceFromRef(ctx, args[0]);
    return instance.run(ctx);
  }
  const params = args as unknown as QueryParameter[];
  const instance = resolveQueryInstance(ctx, params);
  return instance.run(ctx);
}

/**
 * Subscribe to synchronous query membership additions.
 */
export function subscribeQueryAdd(
  ctx: KernelContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  let query: QueryInstance;
  if (isQuery(args)) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args as QueryParameter[]);
  }
  query.internalAddSubscriptions.add(callback);
  return () => query.internalAddSubscriptions.delete(callback);
}

/**
 * Subscribe to synchronous query membership removals.
 */
export function subscribeQueryRemove(
  ctx: KernelContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  let query: QueryInstance;
  if (isQuery(args)) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args as QueryParameter[]);
  }
  query.internalRemoveSubscriptions.add(callback);
  return () => query.internalRemoveSubscriptions.delete(callback);
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
