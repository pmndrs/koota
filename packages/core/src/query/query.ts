import { SparseSet } from '@koota/collections';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId, packEntity } from '../entity/utils/pack-entity';
import {
  isIdentifier,
  isIdentifierPair,
  joinKeyQueries,
  leaveKeyQueries,
  lookupAllIdentifiers,
} from '../identifier/identifier';
import { PAGE_SIZE } from '../entity/utils/pack-entity';
import { EMPTY_MASK_PAGE } from '../entity/utils/paged-mask';
import { getEntitiesWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { TagTrait, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import { getTrackingType, isModifier, isTrackingModifier } from './modifier';
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
  type EventType,
  type TrackingGroup,
} from './types';
import { checkQuery, passesStaticMasks } from './utils/check-query';
import {
  checkQueryTracking,
  checkQueryTrackingSeed,
  seedPairRemovals,
} from './utils/check-query-tracking';
import { checkQueryWithFilters, passesQueryFilters } from './utils/check-query-filters';
import { createQueryHash } from './utils/create-query-hash';
import { isQuery } from './utils/is-query';
import { clearPendingChanges } from './utils/mark-tracked-trait-changed';

export const IsExcluded: TagTrait = trait();

function resolveRelationFilter(
  pair: RelationPair,
  term: ResolvedRelationFilter['term']
): ResolvedRelationFilter {
  const targetQuery = pair.targetQuery;
  if (!targetQuery) {
    return { ...pair, term, targetQueryRef: undefined, targetQueryMatches: undefined };
  }

  return {
    ...pair,
    term,
    targetQueryRef: isQuery(targetQuery) ? targetQuery : createQuery(...targetQuery),
    targetQueryMatches: new SparseSet(),
  };
}

/** Adds a pair from a modifier as a relation filter. Its relation only needs to be registered. */
function addPairFilter(
  ctx: WorldContext,
  query: QueryInstance,
  pair: RelationPair,
  term: 2 | 3 | 4 | 5
): ResolvedRelationFilter {
  ensureTraitInstance(ctx, (pair.relation as Relation<Trait>)[$internal].trait);
  const filter = resolveRelationFilter(pair, term);
  ensureQueryFilters(query).pairs.push(filter);
  return filter;
}

export function runQuery<T extends QueryParameter[]>(
  ctx: WorldContext,
  query: QueryInstance<T>,
  params: QueryParameter[]
): QueryView<T> {
  if (ctx.dirtyQueries.length !== 0) commitQueryRemovals(ctx);
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
  if (ctx.dirtyQueries.length !== 0) commitQueryRemovals(ctx);
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
 * set that run exposed. A run nested inside a walk of the batch keeps it as it is. For Removed
 * queries, both batches can read destroyed entities until the world's retention cap evicts them.
 * Static alternatives in a mixed or query carry their live matches into the next batch.
 */
function consumeTrackingBatch(query: QueryInstance) {
  if (query.iterating !== 0) return;
  const exposed = query.entities;
  const next = query.exposed;
  next.clear();
  query.entities = next;
  exposeQuerySet(query, exposed);
  const { dense, length } = exposed;
  for (let i = 0; i < length; i++) {
    resetQueryTrackingBitmasks(query, getEntityId(dense[i] as Entity));
  }
  if (query.filters?.tracking === 'or') {
    // Pending matches already satisfy the mandatory terms. Carry forward their static alternatives.
    for (let i = 0; i < length; i++) {
      const entity = dense[i] as Entity;
      if (passesQueryFilters(query.ctx, query, entity)) next.add(entity);
    }
  }
}

/** Expired history leaves both batches without emitting a second removal event. */
export function evictEntityFromQuery(query: QueryInstance, entity: Entity) {
  // Tracking queries reset on spawn. Identifier queries are outside that list.
  if (query.identifierFilters !== undefined) {
    resetQueryTrackingBitmasks(query, getEntityId(entity));
  }
  if (query.entities.length !== 0) query.entities.remove(entity);
  query.toRemove?.remove(entity);
  if (query.exposed.length !== 0 && query.exposed.has(entity)) {
    /* @cold */ if (query.iterating !== 0) {
      // An active walk keeps its array and skips expired handles. Later reads see the new set.
      const next = new SparseSet();
      const { dense, length } = query.exposed;
      for (let i = 0; i < length; i++) if (dense[i] !== entity) next.add(dense[i]);
      exposeQuerySet(query, next);
    } else {
      query.exposed.remove(entity);
    }
  }
  query.version++;
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
  if (query.dropped) return;
  const toRemove = query.toRemove;
  if (
    query.identifierFilters !== undefined &&
    !query.isTracking &&
    query.entities.has(entity) &&
    (toRemove === null || !toRemove.has(entity))
  )
    return;
  if (toRemove !== null && toRemove.length !== 0) toRemove.remove(entity);
  query.entities.add(entity);
  query.version++;

  const subscribers = query.addSubscriptions;
  if (subscribers !== null && subscribers.size !== 0) {
    emitQuerySubscribers(query.ctx, subscribers, entity);
  }
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
    if (!query.dirty) {
      query.dirty = true;
      ctx.dirtyQueries.push(query);
    }
  }
  query.version++;

  const subscribers = query.removeSubscriptions;
  if (subscribers !== null && subscribers.size !== 0) {
    emitQuerySubscribers(ctx, subscribers, entity);
  }
}

/** Trait removal does not reach the static queries a destroyed entity satisfied without a trait. */
export function leaveTraitlessQueries(ctx: WorldContext, entity: Entity) {
  const queries = ctx.notQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (!query.isTracking) removeEntityFromQuery(ctx, query, entity);
    else if (query.filters?.tracking && !checkQueryTracking(ctx, query, entity, 'change', -1, 0)) {
      removeEntityFromQuery(ctx, query, entity);
    }
  }
}

/**
 * Re-evaluate the anchored queries that read a trait after an event on an entity. The entity can
 * only be in the ones anchored to a target it holds, and a dying entity only leaves them.
 */
export function reconcileAnchoredQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  dying: boolean
) {
  const relations = instance.anchorRelations;
  const eid = getEntityId(entity);
  for (let r = 0; r < relations.length; r++) {
    const targets = relations[r].relationTargets?.[eid >>> 10]?.[eid & 1023];
    if (targets === undefined) continue;
    if (typeof targets === 'number') reconcileTargetQueries(ctx, entity, targets as Entity, dying);
    else {
      for (let i = 0; i < targets.length; i++) reconcileTargetQueries(ctx, entity, targets[i], dying);
    }
  }
}

/** Re-evaluate an entity against the anchored queries that name a target. */
export function reconcileTargetQueries(
  ctx: WorldContext,
  entity: Entity,
  target: Entity,
  dying: boolean
) {
  const targetId = getEntityId(target);
  const queries = ctx.targetQueries[targetId >>> 10]?.[targetId & 1023];
  if (queries === undefined) return;
  // A subscriber can drop queries from the list, which swaps the last one into the freed slot.
  for (let i = queries.length - 1; i >= 0; i--) {
    const query = queries[i];
    if (query === undefined || !query.anchored) continue;
    if (!dying && checkQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
    else removeEntityFromQuery(ctx, query, entity);
  }
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
  const dirty = ctx.dirtyQueries;
  let kept = 0;
  for (let q = 0; q < dirty.length; q++) {
    const query = dirty[q];
    // A query being walked keeps its removals pending so the walk sees a stable list.
    if (query.iterating !== 0) {
      dirty[kept++] = query;
      continue;
    }
    query.dirty = false;
    const toRemove = query.toRemove!;
    const { dense, length } = toRemove;
    for (let i = length - 1; i >= 0; i--) {
      const eid = dense[i];
      toRemove.remove(eid);
      query.entities.remove(eid);
    }
  }
  // Popping keeps the backing store, which a length write would release.
  while (dirty.length > kept) dirty.pop();
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

/** The group for a tracking modifier's traits or for its pairs, created on first use. */
function trackingGroup(
  groups: TrackingGroup[],
  logic: 'and' | 'or',
  type: EventType,
  id: number,
  tracksPairs: boolean
): TrackingGroup {
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (
      group.type === type &&
      group.id === id &&
      group.logic === logic &&
      (group.pairs !== null) === tracksPairs
    ) {
      return group;
    }
  }
  const group: TrackingGroup = {
    logic,
    type,
    id,
    bitmasks: [],
    trackers: [],
    single: false,
    pairs: tracksPairs ? [] : null,
  };
  groups.push(group);
  return group;
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
  const pairs = modifier.pairs;

  if (pairs === null || modifier.traits.length !== 0) {
    const group = trackingGroup(groups, logic, trackingType, id, false);
    for (const trait of modifier.traits) {
      const instance = ensureTraitInstance(ctx, trait);
      query.traits.push(trait);
      query.traitInstances.push(instance);

      const genId = instance.generationId;
      group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;

      if (trackingType === 'change') {
        query.changedMasks[genId] = (query.changedMasks[genId] || 0) | instance.bitflag;
      }
    }

    let tracked = 0;
    for (const mask of group.bitmasks) {
      for (let bits = mask ?? 0; bits !== 0; bits &= bits - 1) tracked++;
    }
    group.single = tracked === 1;
  }

  if (pairs !== null) {
    const group = trackingGroup(groups, logic, trackingType, id, true);
    const tracked = group.pairs!;
    for (let i = 0; i < pairs.length; i++) {
      if (tracked.length === 32) {
        throw new Error(
          'Koota: [TRACKED_PAIRS] A tracking modifier tracks at most 32 relation pairs.'
        );
      }
      // A tracked pair matches on its events. It joins the relation filters for their list
      // membership and target query, and the relation's tracking list so a pair write reaches it.
      const filter = addPairFilter(ctx, query, pairs[i], 4);
      query.traitInstances.push(
        getTraitInstance(ctx.traitInstances, filter.relation[$internal].trait)!
      );
      group.bitmasks[0] = (group.bitmasks[0] || 0) | (1 << tracked.length);
      tracked.push(filter);
    }
  }

  if (trackingType === 'remove') query.retains = true;
  query.isTracking = true;
}

/** Folds a trait's bit into the query's flat mask table under the given term. */
function addMaskBits(masks: number[], genId: number, bits: number, term: 1 | 2 | 3) {
  let i = 0;
  while (i < masks.length && masks[i] !== genId) i += 4;
  if (i === masks.length) masks.push(genId, 0, 0, 0);
  masks[i + term] |= bits;
}

/** Allocate pair and or filters only when the static mask table cannot express them. */
function ensureQueryFilters(query: QueryInstance) {
  return (query.filters ??= { pairs: [], orMasks: null, not: [], tracking: null });
}

/** A static or term can be satisfied by a held bit, a pair or a negated branch. */
function ensureOrFilters(query: QueryInstance) {
  const filters = ensureQueryFilters(query);
  filters.orMasks ??= [];
  return filters;
}

export function createQueryInstance<T extends QueryParameter[]>(
  ctx: WorldContext,
  parameters: T
): QueryInstance {
  const query: QueryInstance = {
    version: 0,
    ctx,
    parameters,
    identifierFilters: undefined,
    hash: '',
    refId: -1,
    traits: [],
    traitInstances: [],
    masks: [],
    trackingGroups: [],
    entities: new SparseSet(),
    exposed: null!,
    iterating: 0,
    isTracking: false,
    retains: false,
    filters: null,
    changedMasks: [],
    toRemove: null,
    dirty: false,
    notIndex: -1,
    dropped: false,
    inlineNodes: null,
    anchored: false,
    listSlots: [],
    cleanup: null,
    addSubscriptions: null,
    removeSubscriptions: null,
    layoutCache: null,
    iterationBuffers: undefined,
    viewBindings: [],
  };

  // Static masks are assembled after registering the modifier dependencies.
  const required: TraitInstance[] = [];
  const forbidden: TraitInstance[] = [];
  const or: TraitInstance[] = [];
  const all = query.traitInstances;
  const masks = query.masks;

  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];

    if (isIdentifierPair(parameter)) {
      (query.identifierFilters ??= []).push(parameter);
      required.push(ensureTraitInstance(ctx, parameter.identifier[$internal].trait));
      continue;
    }
    if (isIdentifier(parameter)) {
      required.push(ensureTraitInstance(ctx, parameter[$internal].trait));
      continue;
    }

    if (isRelationPair(parameter)) {
      // A wildcard pair is the relation's membership, which the required mask already checks.
      if (parameter.target !== '*')
        ensureQueryFilters(query).pairs.push(resolveRelationFilter(parameter, 1));
      const baseTrait = (parameter.relation as Relation<Trait>)[$internal].trait;
      required.push(ensureTraitInstance(ctx, baseTrait));
      query.traits.push(baseTrait);
      continue;
    }

    if (isModifier(parameter)) {
      const traits = parameter.traits;
      const pairs = parameter.pairs;
      if (parameter.type === 'not') {
        for (let j = 0; j < traits.length; j++) forbidden.push(ensureTraitInstance(ctx, traits[j]));
        if (pairs !== null)
          for (let j = 0; j < pairs.length; j++) addPairFilter(ctx, query, pairs[j], 2);
      } else if (parameter.type === 'or') {
        for (let j = 0; j < traits.length; j++) or.push(ensureTraitInstance(ctx, traits[j]));
        if (pairs !== null) {
          // An or pair can satisfy the or term alone, so the or bits are checked beside the pairs.
          ensureOrFilters(query);
          for (let j = 0; j < pairs.length; j++) addPairFilter(ctx, query, pairs[j], 3);
        }
        const nested = parameter.modifiers;
        if (nested !== null) {
          for (let j = 0; j < nested.length; j++) {
            const branch = nested[j];
            if (branch.type === 'not') {
              ensureOrFilters(query);
              const masks: number[] = [];
              const pairs: ResolvedRelationFilter[] = [];
              for (const trait of branch.traits) {
                const instance = ensureTraitInstance(ctx, trait);
                all.push(instance);
                addMaskBits(masks, instance.generationId, instance.bitflag, 2);
              }
              if (branch.pairs !== null) {
                for (const pair of branch.pairs) pairs.push(addPairFilter(ctx, query, pair, 5));
              }
              query.filters!.not.push({ masks, pairs });
            } else if (isTrackingModifier(branch)) {
              processTrackingModifier(ctx, query, branch, 'or', query.trackingGroups);
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

  const hasNegatedOr = query.filters !== null && query.filters.not.length !== 0;
  if (
    (or.length !== 0 || query.filters?.orMasks != null) &&
    query.trackingGroups.some((group) => group.logic === 'or')
  ) {
    const filters = ensureOrFilters(query);
    filters.tracking = query.trackingGroups.every((group) => group.logic === 'or') ? 'or' : 'and';
  }

  // A lone negated branch uses the ordinary exclusion masks and pair filters.
  if (
    query.filters?.not.length === 1 &&
    or.length === 0 &&
    !query.filters.tracking &&
    !query.filters.pairs.some((filter) => filter.term === 3)
  ) {
    masks.push(...query.filters.not[0].masks);
    for (const pair of query.filters.not[0].pairs) pair.term = 2;
    query.filters.orMasks = null;
    query.filters.not = [];
    if (query.filters.pairs.length === 0) query.filters = null;
  } else if (query.filters !== null && query.filters.not.length !== 0) {
    const filters = query.filters;
    // Single absent traits share a mask check with the positive alternatives.
    filters.not = filters.not.filter(({ masks, pairs }) => {
      const bits = masks[2];
      if (pairs.length !== 0 || masks.length !== 4 || (bits & (bits - 1)) !== 0) return true;
      addMaskBits(filters.orMasks!, masks[0], bits, 2);
      return false;
    });
  }

  for (let i = 0; i < required.length; i++) {
    all.push(required[i]);
    addMaskBits(masks, required[i].generationId, required[i].bitflag, 1);
  }
  for (let i = 0; i < forbidden.length; i++) {
    all.push(forbidden[i]);
    addMaskBits(masks, forbidden[i].generationId, forbidden[i].bitflag, 2);
  }
  const relationFilters = query.filters?.pairs ?? [];
  const orMasks = query.filters?.orMasks;
  for (let i = 0; i < or.length; i++) {
    all.push(or[i]);
    addMaskBits(orMasks ?? masks, or[i].generationId, or[i].bitflag, 3);
  }
  query.hash = createQueryHash(parameters);

  ctx.queriesHashMap.set(query.hash, query);

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
    if (anchorRelation === undefined) joinList(queryList(query, instance), query, i);
    else if (!instance.anchorRelations.includes(anchorRelation)) {
      instance.anchorRelations.push(anchorRelation);
    }
  }
  if (keyFilters !== undefined) for (const pair of keyFilters) joinKeyQueries(ctx, query, pair);

  // A tracking query exposes one set while it collects the next batch in the other.
  query.exposed = query.isTracking ? new SparseSet() : query.entities;

  // Spawn resets tracking queries and adds entities that satisfy a query without traits.
  // Fresh entities own no keys, so identifier queries reset their trackers on eviction instead.
  if (
    query.identifierFilters === undefined &&
    (query.isTracking || ((orMasks == null || hasNegatedOr) && !hasPositiveMask(masks)))
  ) {
    query.notIndex = ctx.notQueries.length;
    ctx.notQueries.push(query);
  }

  const hasFilters = query.filters !== null;
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
      relationSlot(query, relationTraitInstance) === all.length + k
    ) {
      joinList(relationTraitInstance.relationQueries, query, all.length + k);
    }

    if (typeof pair.target === 'number') {
      // A query is indexed by every target it names, so it can be dropped once that target is gone.
      const eid = getEntityId(pair.target);
      const page = (ctx.targetQueries[eid >>> 10] ??= []);
      const targetQueries = (page[eid & 1023] ??= []);
      if (!targetQueries.includes(query)) targetQueries.push(query);
      // Only a required pair narrows the candidates.
      const sources = relationTraitInstance?.relationSourcesByTarget?.[eid] ?? EMPTY_ENTITIES;
      if (
        pair.term === 1 &&
        (targetCandidates === undefined || sources.length < targetCandidates.length)
      ) {
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
          // A target entering or leaving the target query is not an event for a tracking query.
          const match = query.isTracking
            ? checkQueryTracking(ctx, query, source, 'change', 0, 0)
            : checkQueryWithFilters(ctx, query, source);
          if (match) {
            addEntityToQuery(query, source);
          } else {
            removeEntityFromQuery(ctx, query, source);
          }
        }
      };

      const cleanup = (query.cleanup ??= []);
      cleanup.push(
        subscribeEnter(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches!.add(target);
          refreshSourcesForTarget(target);
        })
      );
      cleanup.push(
        subscribeExit(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches!.remove(target);
          refreshSourcesForTarget(target);
        })
      );
    }
  }

  const index = ctx.entityIndex;
  let candidates: readonly Entity[];
  let candidateCount: number;
  if (query.identifierFilters !== undefined) {
    // A key bounds the candidates. The matcher checks every remaining term.
    candidates = lookupAllIdentifiers(ctx, query.identifierFilters[0]);
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
      if (query.identifierFilters !== undefined && !checkQuery(ctx, query, entity)) return;
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
        ? checkQueryWithFilters(ctx, query, entity)
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
  const { generations } = index.allocator;
  const masks = query.masks;
  const entityMasks = ctx.entityMasks;
  const single = masks.length === 4;
  const required = masks[1];
  const forbidden = masks[2];
  const or = masks[3];

  for (let p = 0; p < ownedPages.length; p++) {
    const pageId = ownedPages[p];
    const end = pageCursors[p];
    const gens = generations[pageId]!;
    const page = entityMasks[masks[0]][pageId];
    for (let offset = 0; offset < end; offset++) {
      const word = page[offset << 2];
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
/** The list on a trait instance a query belongs to, by the events it wants. */
function queryList(query: QueryInstance, instance: TraitInstance): QueryInstance[] {
  return query.isTracking ? instance.trackingQueries : instance.queries;
}

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
  if (query.dropped) return;
  query.dropped = true;
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
    leaveList(queryList(query, instance), query, i, instance, false);
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
    if (ctx.queryCallbackDepth !== 0) ctx.notQueries = ctx.notQueries.slice();
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

  if (query.dirty) {
    query.dirty = false;
    ctx.dirtyQueries.splice(ctx.dirtyQueries.indexOf(query), 1);
  }
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
 * Subscribe to query entries. Internal equivalent of world.onEnter().
 */
export function subscribeEnter(
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
 * Subscribe to query exits. Internal equivalent of world.onExit().
 */
export function subscribeExit(
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

// Keys are hash consed so equal parameter lists share one id across every world.
const queryKeys = new Map<string, Query<any>>();

export function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T> {
  const hash = createQueryHash(parameters);

  const existing = queryKeys.get(hash);
  if (existing) return existing as Query<T>;

  const id = queryId++;
  const queryRef = Object.freeze({
    [$queryRef]: true,
    id,
    hash,
    parameters,
  }) as Query<T>;

  queryKeys.set(hash, queryRef);

  return queryRef;
}
