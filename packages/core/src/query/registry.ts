import { SparseSet } from '@koota/collections';
import { getEntityId, packEntity, PAGE_SIZE } from '../entity/handle';
import type { Entity } from '../entity/types';
import { isIdentifierPair } from '../identifier/identifier';
import { lookupAllIdentifierScopes } from '../identifier/ownership';
import type { IdentifierKey, IdentifierPair } from '../identifier/types';
import { $internal } from '../internal';
import { isRelationPair } from '../relation/relation';
import { getRelationSources } from '../relation/targets';
import type { Relation, RelationPair } from '../relation/types';
import { getTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { subscribeTargetQuery } from './hooks';
import {
  matchesQuery,
  matchesQueryWithFilters,
  matchesMaskWord,
  matchesQueryMasks,
} from './matching';
import { addEntityToQuery } from './membership';
import { createQueryHash, isStableParameter } from './query';
import { invalidateQueryTransitions, reconcileTargetFilter } from './reconciliation';
import { compileQueryTerms, hasPositiveMask } from './terms';
import {
  checkQueryTrackingSeed,
  clearPendingChanges,
  consumeTrackingBatch,
  seedPairRemovals,
} from './tracking';
import type {
  InlineQueryNode,
  Query,
  QueryInstance,
  QueryParameter,
  ResolvedRelationFilter,
} from './types';

export function registerQuery<T extends QueryParameter[]>(
  ctx: WorldContext,
  parameters: T
): QueryInstance {
  const query: QueryInstance = {
    version: 0,
    ctx,
    parameters,
    identifierFilters: undefined,
    rechecks: false,
    hash: '',
    queryId: -1,
    traits: [],
    traitInstances: [],
    masks: [],
    trackingGroups: [],
    entities: new SparseSet(),
    exposed: null!,
    iterating: 0,
    readers: 0,
    isTracking: false,
    retains: false,
    filters: null,
    changedMasks: [],
    notIndex: -1,
    inlineNodes: null,
    anchored: false,
    listSlots: [],
    cleanup: null,

    addSubscriptions: null,
    removeSubscriptions: null,
    layoutCache: null,
    viewBindings: [],
  };

  const checksTraitless = compileQueryTerms(ctx, query);
  query.hash = createQueryHash(parameters);
  ctx.queriesHashMap.set(query.hash, query);
  const targetCandidates = registerQueryDependencies(ctx, query, checksTraitless);
  seedQuery(ctx, query, targetCandidates);
  return query;
}

/**
 * A static query that filters by key leaves the trait's query list for a list under its key.
 * Assigning or releasing a key then reconciles the queries for that key alone, however many
 * keys are queried. Tracking queries stay on the trait so they keep receiving its events.
 */
function joinKeyQueries(ctx: WorldContext, query: QueryInstance, pair: IdentifierPair) {
  const queries = ctx.traitInstances[pair.identifier.id]!.identifier!.queries;
  const list = queries.get(pair.target);
  if (list === undefined) queries.set(pair.target, [query]);
  else if (!list.includes(query)) list.push(query);
}

function leaveKeyQueries(ctx: WorldContext, query: QueryInstance, pair: IdentifierPair) {
  const queries = ctx.traitInstances[pair.identifier.id]?.identifier?.queries;
  const list = queries?.get(pair.target);
  if (list === undefined) return;
  const rest = list.filter((other) => other !== query);
  if (rest.length === 0) queries!.delete(pair.target);
  else queries!.set(pair.target, rest);
}

/** Subscribe to the inputs that can change this result and find the narrowest source of candidates. */
function registerQueryDependencies(
  ctx: WorldContext,
  query: QueryInstance,
  checksTraitless: boolean
) {
  const all = query.traitInstances;
  const relationFilters = query.filters?.pairs ?? [];
  // A pending bit speaks for the Changed queries that existed when it was set, not for this one.
  // Dead ids are cleared too, since a trait that lost its last reader leaves its bits behind.
  if (ctx.defersChanges && query.changedMasks.length !== 0) {
    const dense = ctx.entityIndex.dense;
    for (let i = 0; i < dense.length; i++) clearPendingChanges(ctx, getEntityId(dense[i]));
    ctx.defersChanges = false;
  }

  query.listSlots = new Array<number>(all.length + relationFilters.length).fill(-1);
  const keyFilters = query.isTracking ? undefined : query.identifierFilters;
  // A required pair with a concrete target bounds a static query to the sources of that target.
  const anchor =
    query.isTracking || keyFilters !== undefined
      ? undefined
      : relationFilters.find((filter) => filter.term === 1 && typeof filter.target === 'number');
  const anchorRelation =
    anchor && getTraitInstance(ctx.traitInstances, anchor.relation[$internal].trait)!;
  query.anchored = anchorRelation !== undefined;
  for (let i = 0; i < all.length; i++) {
    const instance = all[i];
    if (all.indexOf(instance) !== i) continue;
    // The key lists reconcile a static query for every identifier it filters by key.
    if (keyFilters?.some((pair) => pair.identifier.id === instance.trait.id)) continue;
    if (anchorRelation === undefined) joinList(getQueryList(query, instance), query, i);
    else if (!instance.anchorRelations.includes(anchorRelation)) {
      instance.anchorRelations.push(anchorRelation);
    }
  }
  if (keyFilters !== undefined) for (const pair of keyFilters) joinKeyQueries(ctx, query, pair);

  // A tracking query exposes one set while it collects the next batch in the other.
  query.exposed = query.isTracking ? new SparseSet() : query.entities;

  // Spawn resets tracking queries and adds entities that satisfy a query without traits.
  // Fresh entities own no keys, so identifier queries reset their trackers on eviction instead.
  if (checksTraitless) {
    query.notIndex = ctx.notQueries.length;
    ctx.notQueries.push(query);
  }

  // Entities already related to a concrete target are the only candidates such a query can match.
  let targetCandidates: readonly Entity[] | undefined;

  for (let k = 0; k < relationFilters.length; k++) {
    const pair = relationFilters[k];
    const relationTrait = pair.relation[$internal].trait;
    const relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
    if (relationTraitInstance && anchorRelation !== undefined) {
      if (!relationTraitInstance.anchorRelations.includes(anchorRelation)) {
        relationTraitInstance.anchorRelations.push(anchorRelation);
      }
    } else if (
      relationTraitInstance &&
      getRelationSlot(query, relationTraitInstance) === all.length + k
    ) {
      if (
        keyFilters !== undefined &&
        relationFilters.some((filter) => filter.relation === pair.relation && filter.term === 1)
      ) {
        const identifiers = (relationTraitInstance.relationQueryIdentifiers ??= []);
        if (!identifiers.includes(keyFilters[0].identifier))
          identifiers.push(keyFilters[0].identifier);
      } else {
        joinList(relationTraitInstance.relationQueries, query, all.length + k);
      }
    }

    if (typeof pair.target === 'number') {
      // A query is indexed by every target it names, so it can be dropped once that target is gone.
      const eid = getEntityId(pair.target);
      const page = (ctx.targetQueries[eid >>> 10] ??= []);
      const targetQueries = (page[eid & 1023] ??= []);
      if (!targetQueries.includes(query)) targetQueries.push(query);
      // Only a required pair narrows the candidates.
      const sources = getRelationSources(ctx, pair.relation, pair.target);
      if (
        pair.term === 1 &&
        (targetCandidates === undefined || sources.length < targetCandidates.length)
      ) {
        targetCandidates = sources;
      }
    }

    if (pair.resolvedTargetQuery && pair.targetQueryMatches) {
      const targetQuery = ensureQueryInstance(ctx, pair.resolvedTargetQuery);
      if (targetQuery.isTracking) consumeTrackingBatch(targetQuery);
      const { dense, length } = targetQuery.exposed;
      for (let i = 0; i < length; i++) pair.targetQueryMatches.add(dense[i]);

      const cleanup = (query.cleanup ??= []);
      cleanup.push(
        subscribeTargetQuery(
          ctx,
          pair.resolvedTargetQuery,
          (target) => {
            pair.targetQueryMatches!.add(target);
            reconcileTargetFilter(ctx, query, pair, target, 'add');
          },
          true
        )
      );
      cleanup.push(
        subscribeTargetQuery(
          ctx,
          pair.resolvedTargetQuery,
          (target) => {
            pair.targetQueryMatches!.remove(target);
            reconcileTargetFilter(ctx, query, pair, target, 'remove');
          },
          false
        )
      );
    }
  }
  return targetCandidates;
}

function seedQuery(
  ctx: WorldContext,
  query: QueryInstance,
  targetCandidates: readonly Entity[] | undefined
) {
  const masks = query.masks;
  const hasFilters = query.filters !== null;
  const index = ctx.entityIndex;
  let candidates: readonly Entity[];
  let candidateCount: number;
  if (query.identifierFilters !== undefined) {
    // A key bounds the candidates. The matcher checks every remaining term.
    candidates = lookupAllIdentifierScopes(ctx, query.identifierFilters[0]);
    candidateCount = candidates.length;
  } else if (targetCandidates !== undefined && !query.isTracking) {
    candidates = targetCandidates;
    candidateCount = targetCandidates.length;
  } else {
    candidates = index.dense;
    candidateCount = index.aliveCount;
  }

  if (query.trackingGroups.length > 0) {
    // Seed from current membership and retained removals. Alive entities come first,
    // then retained entities in destroy order, which only Removed terms can match.
    if (query.retains && hasFilters) seedPairRemovals(ctx, query);
    const seed = (entity: Entity) => {
      if (query.identifierFilters !== undefined && !matchesQuery(ctx, query, entity)) return;
      if (!checkQueryTrackingSeed(ctx, query, entity)) return;
      addEntityToQuery(query, entity);
    };
    for (let i = 0; i < candidateCount; i++) seed(candidates[i]);
    // A destroyed entity owns no key, so an identifier query has no retained entity to seed.
    if (query.retains && query.identifierFilters === undefined) {
      const tombstones = ctx.tombstones;
      for (let k = 0; k < tombstones.ids.length; k++) {
        seed(tombstones.ids[(tombstones.head + k) % tombstones.ids.length]);
      }
    }
  } else if (candidates === index.dense && !hasFilters && hasPositiveMask(masks)) {
    scanMaskPages(ctx, query);
  } else {
    for (let i = 0; i < candidateCount; i++) {
      const entity = candidates[i];
      const match = hasFilters
        ? matchesQueryWithFilters(ctx, query, entity)
        : matchesQuery(ctx, query, entity);
      if (match) addEntityToQuery(query, entity);
    }
  }
}

/**
 * Matches a fresh query against the mask pages directly instead of visiting each live entity,
 * which reads the words in order and skips the entity handle until a slot matches.
 */
function scanMaskPages(ctx: WorldContext, query: QueryInstance) {
  const index = ctx.entityIndex;
  const { ownedPages, pageCursors } = index;
  const { generations } = index.allocator;
  const masks = query.masks;
  const entityMasks = ctx.entityMasks;
  const single = masks.length === 4;
  const required = masks[1];
  const forbidden = masks[2];
  // The first word can reject an Or miss if it holds every alternative.
  let or = masks[3];
  for (let i = 7; or !== 0 && i < masks.length; i += 4) {
    if (masks[i] !== 0) or = 0;
  }

  for (let p = 0; p < ownedPages.length; p++) {
    const pageId = ownedPages[p];
    const end = pageCursors[p];
    const gens = generations[pageId]!;
    const page = entityMasks[masks[0]][pageId];
    for (let offset = 0; offset < end; offset++) {
      const word = page[offset << 2];
      if (!matchesMaskWord(word, required, forbidden, or)) continue;
      const eid = pageId * PAGE_SIZE + offset;
      if (!single && !matchesQueryMasks(masks, entityMasks, eid)) continue;
      addEntityToQuery(query, packEntity(gens[offset], eid));
    }
  }
}

/**
 * A query records its position in every trait list it joins, so leaving is a swap with the last
 * entry instead of a scan. Trait slots come first, then one slot per relation filter.
 */
/** The list on a trait instance a query belongs to, by the events it wants. */
function getQueryList(query: QueryInstance, instance: TraitInstance): QueryInstance[] {
  return query.isTracking ? instance.trackingQueries : instance.queries;
}

function joinList(list: QueryInstance[], query: QueryInstance, slot: number) {
  query.listSlots[slot] = list.length;
  list.push(query);
  invalidateQueryTransitions(list);
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
  query.listSlots[slot] = -1;
  const last = list.pop()!;
  if (index < list.length) {
    list[index] = last;
    last.listSlots[relation ? getRelationSlot(last, instance) : getTraitSlot(last, instance)] = index;
  }
  invalidateQueryTransitions(list);
}

/** A trait repeated in a query joins its list once, under the first occurrence. */
function getTraitSlot(query: QueryInstance, instance: TraitInstance): number {
  return query.traitInstances.indexOf(instance);
}

function getRelationSlot(query: QueryInstance, instance: TraitInstance): number {
  const filters = query.filters!.pairs;
  for (let k = 0; k < filters.length; k++) {
    if (filters[k].relation[$internal].trait === instance.trait) {
      return query.traitInstances.length + k;
    }
  }
  return -1;
}

/** Remove a cached query and its subscriptions when its relation target is destroyed. */
export function dropQuery(ctx: WorldContext, query: QueryInstance) {
  if (query.inlineNodes !== null) {
    for (let node of query.inlineNodes) {
      node.query = null;
      node.params = null;
      // Preserve shared prefixes until their last query is dropped.
      while (
        node.parent !== null &&
        node.query === null &&
        (node.next === null || node.next.size === 0)
      ) {
        node.parent.next!.delete(node.key!);
        node = node.parent;
      }
    }
    query.inlineNodes = null;
  }
  if (query.cleanup !== null) {
    for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
    query.cleanup = null;
  }

  const all = query.traitInstances;
  for (let i = 0; i < all.length; i++) {
    const instance = all[i];
    leaveList(getQueryList(query, instance), query, i, instance, false);
  }
  const filters = query.filters?.pairs ?? [];
  for (let k = 0; k < filters.length; k++) {
    const trait = filters[k].relation[$internal].trait;
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance) leaveList(instance.relationQueries, query, all.length + k, instance, true);
  }
  if (!query.isTracking && query.identifierFilters !== undefined) {
    for (const pair of query.identifierFilters) leaveKeyQueries(ctx, query, pair);
  }

  if (query.notIndex !== -1) {
    const notQueries = ctx.notQueries;
    const last = notQueries.pop()!;
    if (query.notIndex < notQueries.length) {
      notQueries[query.notIndex] = last;
      last.notIndex = query.notIndex;
    }
    query.notIndex = -1;
  }

  for (const pair of filters) {
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

  if (ctx.queriesHashMap.get(query.hash) === query) ctx.queriesHashMap.delete(query.hash);

  if (query.queryId >= 0 && ctx.queryInstances[query.queryId] === query) {
    ctx.queryInstances[query.queryId] = undefined;
  }
}

/**
 * Drop the cached queries that name the entity as a relation target. A query that needs the pair
 * to match cannot match once its target dies. Any other is built again if it is queried later, so
 * it goes too unless it has subscribers. A tracking query waits for the eviction of its target,
 * since it may still hold the removals the destroy caused.
 */
export function dropTargetQueries(
  ctx: WorldContext,
  targetQueries: QueryInstance[],
  entity: Entity,
  evicted: boolean
) {
  for (let i = targetQueries.length - 1; i >= 0; i--) {
    const query = targetQueries[i];
    const disposable =
      (evicted || !query.isTracking) &&
      (query.addSubscriptions === null || query.addSubscriptions.size === 0) &&
      (query.removeSubscriptions === null || query.removeSubscriptions.size === 0);
    const filters = query.filters!.pairs;
    for (let k = 0; k < filters.length; k++) {
      const pair = filters[k];
      if (pair.target === entity && (disposable || needsPair(query, pair))) {
        dropQuery(ctx, query);
        break;
      }
    }
  }
}

/** The query matches only entities that hold the pair, or that added or changed it. */
function needsPair(query: QueryInstance, pair: ResolvedRelationFilter): boolean {
  if (pair.term !== 4) return pair.term === 1;
  const groups = query.trackingGroups;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.pairs !== null && group.pairs.includes(pair)) {
      return group.logic === 'and' && group.type !== 'remove';
    }
  }
  return false;
}

/** Find or create the world’s instance for an inline parameter list. */
export function ensureInlineQuery(ctx: WorldContext, params: QueryParameter[]): QueryInstance {
  const hash = createQueryHash(params);
  let query = ctx.queriesHashMap.get(hash);
  if (!query) {
    query = registerQuery(ctx, params);
    ctx.queriesHashMap.set(hash, query);
  }
  return query;
}

/** Find or create the world’s instance for a reusable query. */
export function ensureQueryInstance(ctx: WorldContext, query: Query): QueryInstance {
  let instance = ctx.queryInstances[query.id];
  if (instance) return instance;

  instance = ctx.queriesHashMap.get(query.hash);
  if (!instance) {
    instance = registerQuery(ctx, query.parameters);
    ctx.queriesHashMap.set(query.hash, instance);
    if (query.id >= ctx.queryInstances.length) {
      ctx.queryInstances.length = query.id + 1;
    }
    ctx.queryInstances[query.id] = instance;
    instance.queryId = query.id;
  }
  return instance;
}

/** One lookup per parameter, shared by full queries and first-match queries. */
export function findInlineQuery(ctx: WorldContext, params: QueryParameter[]): InlineQueryNode | null {
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let next = node.next?.get(param);
    if (next === undefined) {
      // Fresh pair objects share a path by definition and target.
      if (isIdentifierPair(param)) {
        next = node.next?.get(param.identifier)?.next?.get(param.target);
      } else if (isRelationPair(param) && typeof param.target === 'number') {
        next = node.next?.get(param.relation as Relation<Trait>)?.next?.get(param.target);
      } else return null;
      if (next === undefined) return null;
    }
    node = next;
  }
  return node.query === null ? null : node;
}

/**
 * Lists a query under stable parameters, identifier keys and concrete relation targets. Queries that name a
 * target keep their tree entries so dropping the query can prune every path that reaches it.
 */
export function rememberInlineQuery(
  ctx: WorldContext,
  params: QueryParameter[],
  query: QueryInstance
) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param) || isIdentifierPair(param)) continue;
    if (!isRelationPair(param) || typeof param.target !== 'number') return;
  }
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param)) {
      node = ensureInlineNode(node, param);
      continue;
    }
    if (isIdentifierPair(param)) {
      node = ensureInlineNode(ensureInlineNode(node, param.identifier), param.target);
      continue;
    }
    const pair = param as RelationPair;
    const relationStep = ensureInlineNode(node, pair.relation as Relation<Trait>);
    node = ensureInlineNode(relationStep, pair.target as Entity);
  }
  node.params = params;
  node.query = query;
  if (node.parent !== null) (query.inlineNodes ??= []).push(node);
}

function ensureInlineNode(
  node: InlineQueryNode,
  key: QueryParameter | Relation<Trait> | IdentifierKey
) {
  const next = (node.next ??= new Map());
  let child = next.get(key);
  if (child === undefined) {
    child = {
      next: null,
      params: null,
      query: null,
      parent:
        node.parent !== null || typeof key === 'number' || typeof key === 'string' ? node : null,
      key,
    };
    next.set(key, child);
  }
  return child;
}
