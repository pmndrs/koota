import { SparseSet } from '@koota/collections';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId, packEntity } from '../entity/utils/pack-entity';
import { isNameConfig } from '../name/name-index';
import { EMPTY_MASK_PAGE } from '../entity/utils/paged-mask';
import { PAGE_SIZE } from '../entity/utils/pack-entity';
import { getEntitiesWithRelationTo, hasRelationPair } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait, TraitInstance } from '../trait/types';
import { universe } from '../universe/universe';
import type { WorldContext } from '../world';
import { getTrackingType, isModifier, isOrWithModifiers, isTrackingModifier } from './modifier';
import { bindQueryView, createOwnedView, exposeQuerySet } from './query-view';
import { $queryRef } from './symbols';
import {
  type Modifier,
  type Query,
  type QueryInstance,
  type QueryParameter,
  type QueryView,
  type QuerySubscriber,
  type ResolvedRelationFilter,
  type TrackingGroup,
} from './types';
import { checkQuery, passesStaticMasks } from './utils/check-query';
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
  ctx: WorldContext,
  query: QueryInstance<T>,
  params: QueryParameter[]
): QueryView<T> {
  if (ctx.dirtyQueries.size !== 0) commitQueryRemovals(ctx);
  if (query.isTracking) consumeTrackingBatch(query);
  if (query.iterating !== 0 && query.toRemove !== null && query.toRemove.length !== 0) {
    return retained(ctx, query, params);
  }
  return bindQueryView(ctx, query, params) as QueryView<T>;
}

/** A run nested in a walk cannot commit removals, so it gets a copy without the pending ones. */
function retained<T extends QueryParameter[]>(
  ctx: WorldContext,
  query: QueryInstance,
  params: QueryParameter[]
): QueryView<T> {
  const { dense, length } = query.exposed;
  const toRemove = query.toRemove!;
  const entities: Entity[] = [];
  for (let i = 0; i < length; i++) {
    if (!toRemove.has(dense[i])) entities.push(dense[i] as Entity);
  }
  return createOwnedView<T>(ctx, entities, query, params);
}

export function runQueryFirst(ctx: WorldContext, query: QueryInstance): Entity | undefined {
  if (ctx.dirtyQueries.size !== 0) commitQueryRemovals(ctx);
  // Reading one entity still consumes the entire tracking batch.
  if (query.isTracking) consumeTrackingBatch(query);
  const { dense, length } = query.exposed;
  if (length === 0) return undefined;
  if (query.iterating !== 0 && query.toRemove !== null && query.toRemove.length !== 0) {
    return firstRetained(query);
  }
  return dense[0] as Entity;
}

/** Removals wait while the query is walked, so skip the pending ones by hand. */
function firstRetained(query: QueryInstance): Entity | undefined {
  const { dense, length } = query.exposed;
  const toRemove = query.toRemove!;
  for (let i = 0; i < length; i++) {
    if (!toRemove.has(dense[i])) return dense[i] as Entity;
  }
  return undefined;
}

/**
 * Exposes the batch accumulated since the previous run and starts collecting the next one in the
 * set that run exposed. A run nested inside a walk of the batch keeps it as it is.
 */
function consumeTrackingBatch(query: QueryInstance) {
  if (query.iterating !== 0) return;
  const exposed = query.entities;
  const next = query.batch!;
  next.clear();
  query.entities = next;
  query.batch = exposed;
  exposeQuerySet(query, exposed);
  const { dense, length } = exposed;
  for (let i = 0; i < length; i++) {
    resetQueryTrackingBitmasks(query, getEntityId(dense[i] as Entity));
  }
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
  if (query.dropped) return;
  const toRemove = query.toRemove;
  if (
    query.name !== undefined &&
    !query.isTracking &&
    query.entities.has(entity) &&
    (toRemove === null || !toRemove.has(entity))
  )
    return;
  if (toRemove !== null && toRemove.length !== 0) toRemove.remove(entity);
  query.entities.add(entity);

  const subscribers = query.addSubscriptions;
  if (subscribers !== null && subscribers.size !== 0) {
    emitQuerySubscribers(query.ctx, subscribers, entity);
  }

  query.version++;
}

/** Removes at once unless a walk is in progress, which keeps the removal pending until it ends. */
export function removeEntityFromQuery(ctx: WorldContext, query: QueryInstance, entity: Entity) {
  if (query.dropped || !query.entities.has(entity)) return;
  const toRemove = query.toRemove;
  if (toRemove !== null && toRemove.has(entity)) return;

  if (query.iterating === 0) {
    query.entities.remove(entity);
  } else {
    (query.toRemove ??= new SparseSet()).add(entity);
    ctx.dirtyQueries.add(query);
  }

  const subscribers = query.removeSubscriptions;
  if (subscribers !== null && subscribers.size !== 0) {
    emitQuerySubscribers(ctx, subscribers, entity);
  }

  query.version++;
}

/** A callback can drop queries from any list its caller is still walking. */
function emitQuerySubscribers(ctx: WorldContext, subscribers: Set<QuerySubscriber>, entity: Entity) {
  ctx.queryCallbackDepth++;
  try {
    for (const sub of subscribers) sub(entity);
  } finally {
    ctx.queryCallbackDepth--;
  }
}

export function commitQueryRemovals(ctx: WorldContext) {
  let walked: QueryInstance[] | undefined;
  for (const query of ctx.dirtyQueries) {
    // A query being walked keeps its removals pending so the walk sees a stable list.
    if (query.iterating !== 0) {
      (walked ??= []).push(query);
      continue;
    }
    const toRemove = query.toRemove!;
    const { dense, length } = toRemove;
    for (let i = length - 1; i >= 0; i--) {
      const eid = dense[i];
      toRemove.remove(eid);
      query.entities.remove(eid);
    }
  }
  ctx.dirtyQueries.clear();
  if (walked !== undefined) for (const query of walked) ctx.dirtyQueries.add(query);
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
      if (!trackers[j]) continue;
      const page = trackers[j][pageId];
      if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
    }
  }
}

function ensureTraitInstance(ctx: WorldContext, trait: Trait): TraitInstance {
  return (
    getTraitInstance(ctx.traitInstances, trait) ??
    (registerTrait(ctx, trait), getTraitInstance(ctx.traitInstances, trait)!)
  );
}

function processTrackingModifier(
  ctx: WorldContext,
  query: QueryInstance,
  modifier: Modifier,
  logic: 'and' | 'or',
  groups: TrackingGroup[]
): void {
  const trackingType = getTrackingType(modifier);
  if (!trackingType) return;

  const id = modifier.id;
  let group = groups.find((g) => g.type === trackingType && g.id === id && g.logic === logic);
  if (!group) {
    group = { logic, type: trackingType, id, bitmasks: [], trackers: [] };
    groups.push(group);
  }

  for (const trait of modifier.traits) {
    const instance = ensureTraitInstance(ctx, trait);
    query.traits.push(trait);
    query.traitInstances.push(instance);

    const genId = instance.generationId;
    group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;

    if (trackingType === 'change') {
      query.changedTraits.push(trait);
      query.hasChangedModifiers = true;
    }
  }

  query.isTracking = true;
}

/** Folds a trait's bit into the query's flat mask table under the given term. */
function addMaskBit(masks: number[], instance: TraitInstance, term: 1 | 2 | 3) {
  const genId = instance.generationId;
  let i = 0;
  while (i < masks.length && masks[i] !== genId) i += 4;
  if (i === masks.length) masks.push(genId, 0, 0, 0);
  masks[i + term] |= instance.bitflag;
}

export function createQueryInstance<T extends QueryParameter[]>(
  ctx: WorldContext,
  parameters: T
): QueryInstance {
  const query: QueryInstance = {
    version: 0,
    ctx,
    parameters,
    name: undefined,
    hash: '',
    refId: -1,
    traits: [],
    traitInstances: [],
    masks: [],
    trackingGroups: [],
    entities: new SparseSet(),
    batch: undefined,
    exposed: null!,
    iterating: 0,
    isTracking: false,
    hasChangedModifiers: false,
    changedTraits: [],
    toRemove: null,
    notIndex: -1,
    dropped: false,
    listSlots: [],
    cleanup: null,
    addSubscriptions: null,
    removeSubscriptions: null,
    layoutCache: null,
    iterationBuffers: undefined,
    viewBindings: [],
    relationFilters: [],
  };

  // Tracked instances join first, so their slots come before the static terms.
  const required: TraitInstance[] = [];
  const forbidden: TraitInstance[] = [];
  const or: TraitInstance[] = [];
  const all = query.traitInstances;
  const masks = query.masks;

  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];

    if (isNameConfig(parameter)) {
      const [trait, value] = parameter;
      if (query.name === undefined) query.name = value;
      else if (query.name !== value) query.name = null;
      required.push(ensureTraitInstance(ctx, trait));
      continue;
    }

    if (isRelationPair(parameter)) {
      query.relationFilters.push(resolveRelationFilter(parameter));
      const baseTrait = (parameter.relation as Relation<Trait>)[$internal].trait;
      required.push(ensureTraitInstance(ctx, baseTrait));
      query.traits.push(baseTrait);
      continue;
    }

    if (isModifier(parameter)) {
      const traits = parameter.traits;
      if (parameter.type === 'not') {
        for (let j = 0; j < traits.length; j++) forbidden.push(ensureTraitInstance(ctx, traits[j]));
      } else if (parameter.type === 'or') {
        for (let j = 0; j < traits.length; j++) or.push(ensureTraitInstance(ctx, traits[j]));
        if (isOrWithModifiers(parameter)) {
          for (const nested of parameter.modifiers) {
            if (isTrackingModifier(nested)) {
              processTrackingModifier(ctx, query, nested, 'or', query.trackingGroups);
            }
          }
        }
      } else if (isTrackingModifier(parameter)) {
        processTrackingModifier(ctx, query, parameter, 'and', query.trackingGroups);
      } else {
        for (let j = 0; j < traits.length; j++) ensureTraitInstance(ctx, traits[j]);
      }
    } else {
      const t = parameter as Trait;
      required.push(ensureTraitInstance(ctx, t));
      query.traits.push(t);
    }
  }

  forbidden.push(getTraitInstance(ctx.traitInstances, IsExcluded)!);

  for (let i = 0; i < required.length; i++) {
    all.push(required[i]);
    addMaskBit(masks, required[i], 1);
  }
  for (let i = 0; i < forbidden.length; i++) {
    all.push(forbidden[i]);
    addMaskBit(masks, forbidden[i], 2);
  }
  for (let i = 0; i < or.length; i++) {
    all.push(or[i]);
    addMaskBit(masks, or[i], 3);
  }
  query.hash = createQueryHash(parameters);

  ctx.queriesHashMap.set(query.hash, query);

  const relationFilters = query.relationFilters;
  query.listSlots = new Array<number>(all.length + relationFilters.length).fill(-1);
  for (let i = 0; i < all.length; i++) {
    const instance = all[i];
    if (all.indexOf(instance) !== i) continue;
    joinList(query.isTracking ? instance.trackingQueries : instance.queries, query, i);
  }

  // A tracking query exposes one set while it collects the next batch in the other.
  query.exposed = query.entities;
  if (query.isTracking) query.exposed = query.batch = new SparseSet();

  if (query.name === undefined && forbidden.length > 0) {
    query.notIndex = ctx.notQueries.length;
    ctx.notQueries.push(query);
  }

  const hasRelationFilters = relationFilters.length > 0;
  // Entities already related to a concrete target are the only candidates such a query can match.
  let targetCandidates: readonly Entity[] | undefined;

  for (let k = 0; k < relationFilters.length; k++) {
    const pair = relationFilters[k];
    const relationTrait = pair.relation[$internal].trait;
    const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
    if (relationTraitInstance && relationSlot(query, relationTraitInstance) === all.length + k) {
      joinList(relationTraitInstance.relationQueries, query, all.length + k);
    }

    if (typeof pair.target === 'number') {
      const eid = getEntityId(pair.target);
      const page = (ctx.targetQueries[eid >>> 10] ??= []);
      const targetQueries = (page[eid & 1023] ??= []);
      if (!targetQueries.includes(query)) targetQueries.push(query);
      const sources = relationTraitInstance?.relationSourcesByTarget?.[eid] ?? EMPTY_ENTITIES;
      if (targetCandidates === undefined || sources.length < targetCandidates.length) {
        targetCandidates = sources;
      }
    }

    if (pair.targetQueryRef && pair.targetQueryMatches) {
      for (const target of queryInternal(ctx, pair.targetQueryRef)) {
        pair.targetQueryMatches.add(target);
      }

      const refreshSourcesForTarget = (target: Entity) => {
        const sources = getEntitiesWithRelationTo(ctx, pair.relation as Relation<Trait>, target);
        for (let i = 0; i < sources.length; i++) {
          const source = sources[i];
          const match = checkQueryWithRelations(ctx, query, source);
          if (match) {
            addEntityToQuery(query, source);
          } else {
            removeEntityFromQuery(ctx, query, source);
          }
        }
      };

      const cleanup = (query.cleanup ??= []);
      cleanup.push(
        subscribeQueryAdd(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches!.add(target);
          refreshSourcesForTarget(target);
        })
      );
      cleanup.push(
        subscribeQueryRemove(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches!.remove(target);
          refreshSourcesForTarget(target);
        })
      );
    }
  }

  // A named query can only match the current owner, including on its first run.
  const namedEntity = typeof query.name === 'string' ? ctx.names.get(query.name) : undefined;
  const index = ctx.entityIndex;
  let candidates: readonly Entity[];
  let candidateCount: number;
  if (query.name !== undefined) {
    candidates = namedEntity === undefined ? EMPTY_ENTITIES : [namedEntity];
    candidateCount = candidates.length;
  } else if (targetCandidates !== undefined) {
    candidates = targetCandidates;
    candidateCount = targetCandidates.length;
  } else {
    candidates = index.dense;
    candidateCount = index.aliveCount;
  }

  if (query.trackingGroups.length > 0) {
    for (const group of query.trackingGroups) {
      const { type, id, logic, bitmasks } = group;
      const snapshot = ctx.trackingSnapshots.get(id)!;
      const dirtyMask = ctx.dirtyMasks.get(id)!;
      const changedMask = ctx.changedMasks.get(id)!;

      for (let c = 0; c < candidateCount; c++) {
        const entity = candidates[c];
        if (query.name !== undefined && !checkQuery(ctx, query, entity)) continue;
        if (query.entities.has(entity)) continue;

        const eid = getEntityId(entity);
        let matches = logic === 'and';

        for (let genId = 0; genId < bitmasks.length; genId++) {
          const mask = bitmasks[genId];
          if (!mask) continue;

          const pageId = eid >>> 10;
          const offset = eid & 1023;
          const currentMask = ctx.entityMasks[genId][pageId][offset];
          // Only add and remove trackers keep a snapshot of the masks they compare against.
          const oldMask = type === 'change' ? 0 : snapshot[genId][pageId][offset];

          // A generation's highest bit is 2^30, and shifting past it wraps negative, so the walk stops there.
          for (let bit = 1; bit > 0 && bit <= mask; bit <<= 1) {
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
            for (const pair of relationFilters) {
              if (!hasRelationPair(ctx, entity, pair)) {
                relationMatch = false;
                break;
              }
            }
            if (relationMatch) addEntityToQuery(query, entity);
          } else {
            addEntityToQuery(query, entity);
          }
        }
      }
    }
  } else if (candidates === index.dense && !hasRelationFilters && hasPositiveMask(masks)) {
    scanMaskPages(ctx, query);
  } else {
    for (let c = 0; c < candidateCount; c++) {
      const entity = candidates[c];
      const match = hasRelationFilters
        ? checkQueryWithRelations(ctx, query, entity)
        : checkQuery(ctx, query, entity);
      if (match) addEntityToQuery(query, entity);
    }
  }

  return query;
}

const EMPTY_ENTITIES: readonly Entity[] = [];

/** A required or or bit means a matching slot holds a live entity, since destroy clears every bit. */
function hasPositiveMask(masks: number[]) {
  for (let i = 0; i < masks.length; i += 4) if (masks[i + 1] !== 0 || masks[i + 3] !== 0) return true;
  return false;
}

/**
 * Matches a fresh query against the mask pages directly instead of visiting each live entity,
 * which reads the words in order and skips the entity handle until a slot matches.
 */
function scanMaskPages(ctx: WorldContext, query: QueryInstance) {
  const index = ctx.entityIndex;
  const { ownedPages, pageCursors } = index;
  const { generations, pageAliveCounts } = index.allocator;
  const masks = query.masks;
  const entityMasks = ctx.entityMasks;
  const single = masks.length === 4;
  const required = masks[1];
  const forbidden = masks[2];
  const or = masks[3];

  for (let p = 0; p < ownedPages.length; p++) {
    const pageId = ownedPages[p];
    if (pageAliveCounts[pageId] === 0) continue;
    const end = pageCursors[p];
    const gens = generations[pageId]!;
    const page = entityMasks[masks[0]][pageId];
    for (let offset = 0; offset < end; offset++) {
      const word = page[offset];
      if (
        (word & forbidden) !== 0 ||
        (word & required) !== required ||
        (or !== 0 && (word & or) === 0)
      ) {
        continue;
      }
      const eid = pageId * PAGE_SIZE + offset;
      if (!single && !passesStaticMasks(masks, entityMasks, eid)) continue;
      addEntityToQuery(query, packEntity(gens[offset], eid));
    }
  }
}

/**
 * A query records its position in every trait list it joins, so leaving is a swap with the last
 * entry instead of a scan. Trait slots come first, then one slot per relation filter.
 */
function joinList(list: QueryInstance[], query: QueryInstance, slot: number) {
  query.listSlots[slot] = list.length;
  list.push(query);
}

function leaveList(
  list: QueryInstance[],
  query: QueryInstance,
  slot: number,
  instance: TraitInstance,
  relation: boolean
) {
  const index = query.listSlots[slot];
  if (index === -1) return;
  // A dispatch keeps its old array when a callback removes a query.
  if (query.ctx.queryCallbackDepth !== 0) {
    list = list.slice();
    if (relation) instance.relationQueries = list;
    else if (query.isTracking) instance.trackingQueries = list;
    else instance.queries = list;
  }
  query.listSlots[slot] = -1;
  const last = list.pop()!;
  if (index < list.length) {
    list[index] = last;
    last.listSlots[relation ? relationSlot(last, instance) : traitSlot(last, instance)] = index;
  }
}

/** A trait repeated in a query joins its list once, under the first occurrence. */
function traitSlot(query: QueryInstance, instance: TraitInstance): number {
  return query.traitInstances.indexOf(instance);
}

function relationSlot(query: QueryInstance, instance: TraitInstance): number {
  const filters = query.relationFilters!;
  for (let k = 0; k < filters.length; k++) {
    if (filters[k].relation[$internal].trait === instance.trait) {
      return query.traitInstances.length + k;
    }
  }
  return -1;
}

/** Remove a cached query and its subscriptions when its relation target is destroyed. */
export function dropQuery(ctx: WorldContext, query: QueryInstance) {
  if (query.dropped) return;
  query.dropped = true;
  if (query.cleanup !== null) {
    for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
    query.cleanup = null;
  }

  const all = query.traitInstances;
  for (let i = 0; i < all.length; i++) {
    const instance = all[i];
    leaveList(
      query.isTracking ? instance.trackingQueries : instance.queries,
      query,
      i,
      instance,
      false
    );
  }
  for (let k = 0; k < query.relationFilters!.length; k++) {
    const trait = query.relationFilters![k].relation[$internal].trait;
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance) leaveList(instance.relationQueries, query, all.length + k, instance, true);
  }

  if (query.notIndex !== -1) {
    if (ctx.queryCallbackDepth !== 0) ctx.notQueries = ctx.notQueries.slice();
    const notQueries = ctx.notQueries;
    const last = notQueries.pop()!;
    if (query.notIndex < notQueries.length) {
      notQueries[query.notIndex] = last;
      last.notIndex = query.notIndex;
    }
    query.notIndex = -1;
  }

  for (const pair of query.relationFilters!) {
    if (typeof pair.target !== 'number') continue;
    const eid = getEntityId(pair.target);
    const page = ctx.targetQueries[eid >>> 10];
    const targetQueries = page?.[eid & 1023];
    if (!targetQueries) continue;
    const index = targetQueries.indexOf(query);
    if (index === -1) continue;
    const last = targetQueries.pop()!;
    if (index < targetQueries.length) targetQueries[index] = last;
    if (targetQueries.length === 0) page[eid & 1023] = undefined;
  }

  ctx.dirtyQueries.delete(query);
  if (ctx.queriesHashMap.get(query.hash) === query) ctx.queriesHashMap.delete(query.hash);

  if (query.refId >= 0 && ctx.queryInstances[query.refId] === query) {
    ctx.queryInstances[query.refId] = undefined;
  }
}

/**
 * Resolve or create a QueryInstance for the given parameters.
 * Internal equivalent of world.query().
 */
export function resolveQueryInstance(ctx: WorldContext, params: QueryParameter[]): QueryInstance {
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
  ctx: WorldContext,
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
    query.refId = queryRef.id;
  }
  return query;
}

/**
 * Run a query entirely through internals. No World facade needed.
 */
export function queryInternal<T extends QueryParameter[]>(
  ctx: WorldContext,
  ...args: [Query<T>] | T
): QueryView<T> {
  if (args.length === 1 && isQuery(args[0])) {
    const instance = resolveQueryInstanceFromRef(ctx, args[0]);
    return runQuery(ctx, instance, args[0].parameters) as QueryView<T>;
  }
  const params = args as unknown as QueryParameter[];
  const instance = resolveQueryInstance(ctx, params);
  return runQuery(ctx, instance, params) as QueryView<T>;
}

/**
 * Subscribe to query additions. Internal equivalent of world.onQueryAdd().
 */
export function subscribeQueryAdd(
  ctx: WorldContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  let query: QueryInstance;
  if (isQuery(args)) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args as QueryParameter[]);
  }
  (query.addSubscriptions ??= new Set()).add(callback);
  return () => query.addSubscriptions!.delete(callback);
}

/**
 * Subscribe to query removals. Internal equivalent of world.onQueryRemove().
 */
export function subscribeQueryRemove(
  ctx: WorldContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  let query: QueryInstance;
  if (isQuery(args)) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args as QueryParameter[]);
  }
  (query.removeSubscriptions ??= new Set()).add(callback);
  return () => query.removeSubscriptions!.delete(callback);
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
