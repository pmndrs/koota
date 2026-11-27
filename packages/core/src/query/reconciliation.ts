import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import type { IdentifierKey } from '../identifier/types';
import { $internal } from '../internal';
import { getRelationSources } from '../relation/targets';
import { REMOVED_WORD } from '../trait/membership';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { flushQueryBatch } from './hooks';
import {
  matchesQuery,
  matchesQueryWithFilters,
  matchesMaskWord,
  matchesQueryFilters,
} from './matching';
import { addEntityToQuery, removeEntityFromQuery } from './membership';
import {
  checkQueryTracking,
  checkQueryTrackingFilter,
  checkQueryTrackingPair,
  clearPendingChanges,
  resetQueryTrackingBitmasks,
} from './tracking';
import type {
  EventType,
  QueryInstance,
  ResolvedRelationFilter,
  Transition,
  TransitionCache,
} from './types';

// A null entry marks a query list that cannot be matched from one word.
const transitions = new WeakMap<QueryInstance[], TransitionCache | null>();

export function invalidateQueryTransitions(queries: QueryInstance[]) {
  transitions.delete(queries);
}

function createTransitionCache(queries: QueryInstance[]): TransitionCache | null {
  const generation = queries[0].masks[0];
  let mask = 0;
  for (const query of queries) {
    const masks = query.masks;
    if (
      query.filters !== null ||
      query.identifierFilters !== undefined ||
      masks.length !== 4 ||
      masks[0] !== generation
    )
      return null;
    mask |= masks[1] | masks[2] | masks[3];
  }
  return { generation, mask, byWord: new Map() };
}

function reconcileCachedQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  let cache = transitions.get(queries);
  if (cache === undefined) {
    cache = createTransitionCache(queries);
    transitions.set(queries, cache);
  }
  return cache === null ? 0 : reconcileByTransition(ctx, entity, queries, cache);
}

/** A query can only contain an entity that has held its positive terms. */
function compileTransition(queries: QueryInstance[], held: number, everHeld: number): Transition {
  const actions: number[] = [];
  for (let i = 0; i < queries.length; i++) {
    const masks = queries[i].masks;
    const required = masks[1];
    const forbidden = masks[2];
    const or = masks[3];
    if (matchesMaskWord(everHeld, required, 0, or)) {
      actions.push(matchesMaskWord(held, required, forbidden, or) ? i : ~i);
    }
  }
  return { everHeld, actions };
}

/** Returns the length of the prefix handled from the trait word, or zero for direct matching. */
function reconcileByTransition(
  ctx: WorldContext,
  entity: Entity,
  queries: QueryInstance[],
  cache: TransitionCache
) {
  const eid = getEntityId(entity);
  const page = ctx.entityMasks[cache.generation][eid >>> 10];
  const slot = (eid & 1023) << 2;
  const held = page[slot] & cache.mask;
  const everHeld = (held | page[slot + REMOVED_WORD]) & cache.mask;
  const byWord = cache.byWord;
  if (byWord === null) return reconcileMaskWord(queries, entity, held, everHeld);
  let transition = byWord.get(held);
  if (transition === undefined || (everHeld & ~transition.everHeld) !== 0) {
    if (transition === undefined && byWord.size === 128) {
      // Stop compiling when the list sees too many distinct combinations.
      cache.byWord = null;
      return 0;
    }
    // Widen the possible removals across entities that share their current traits.
    transition = compileTransition(queries, held, everHeld | (transition?.everHeld ?? 0));
    byWord.set(held, transition);
  }
  const count = queries.length;
  const actions = transition.actions;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action >= 0) addEntityToQuery(queries[action], entity);
    else removeEntityFromQuery(queries[~action], entity);
  }
  return count;
}

/** Every query in the prefix reads the same trait word. Subscribers can append other queries. */
function reconcileMaskWord(queries: QueryInstance[], entity: Entity, held: number, everHeld: number) {
  const count = queries.length;
  for (let i = 0; i < count; i++) {
    const query = queries[i];
    const masks = query.masks;
    const required = masks[1];
    const or = masks[3];
    if (!matchesMaskWord(everHeld, required, 0, or)) continue;
    if (matchesMaskWord(held, required, masks[2], or)) addEntityToQuery(query, entity);
    else removeEntityFromQuery(query, entity);
  }
  return count;
}

function reconcileQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  // A query a subscriber registers during the walk is filled as it is made, so the walk covers only
  // the queries the list held when the event arrived.
  const count = queries.length;
  const start = count < 4 ? 0 : reconcileCachedQueries(ctx, entity, queries);
  for (let i = start; i < count; i++) {
    const query = queries[i];
    // A subscriber can also drop a query, which shortens the list.
    if (query === undefined) return;
    if (
      matchesQuery(ctx, query, entity) &&
      (query.filters === null || matchesQueryFilters(ctx, query, entity))
    ) {
      addEntityToQuery(query, entity);
    } else removeEntityFromQuery(query, entity);
  }
}

export function enterTraitlessQueries(ctx: WorldContext, entity: Entity) {
  // Queries that can match without traits need an initial membership check.
  const notQueries = ctx.notQueries;
  for (let i = 0; i < notQueries.length; i++) {
    const query = notQueries[i];
    resetQueryTrackingBitmasks(query, getEntityId(entity));
    if (query.filters?.tracking) {
      if (checkQueryTracking(ctx, query, entity, 'change', -1, 0)) addEntityToQuery(query, entity);
    } else if (!query.isTracking) {
      const matches =
        query.filters !== null
          ? matchesQueryWithFilters(ctx, query, entity)
          : matchesQuery(ctx, query, entity);
      if (matches) addEntityToQuery(query, entity);
    }
  }
}

/** Reconcile the static queries that filter by a key after an assignment changes. */
export function reconcileKeyQueries(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  key: IdentifierKey
) {
  const queries = data.identifier!.queries.get(key);
  if (queries !== undefined) reconcileQueries(ctx, entity, queries);
}

/** Replacement changes key-filtered tracking queries while presence stays the same. */
export function refreshTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  for (const query of data.trackingQueries) {
    if (query.identifierFilters === undefined) continue;
    // A zero event mask checks existing history without recording another event.
    const matches = checkQueryTracking(ctx, query, entity, 'change', -1, 0);
    if (!matches) removeEntityFromQuery(query, entity);
    // Replacement is not a tracked event, so an entity already in the batch is not added again.
    else if (!query.entities.has(entity)) {
      addEntityToQuery(query, entity);
    }
  }
}

/** Record both events before matching a tracking query against the final membership. */
export function reconcileMachine(
  ctx: WorldContext,
  entity: Entity,
  before: TraitInstance | undefined,
  after: TraitInstance | undefined,
  marker: TraitInstance | undefined,
  dying: boolean
) {
  if (ctx.defersChanges) clearPendingChanges(ctx, getEntityId(entity));
  // Self-entry preserves static membership. Only tracking queries need reconciliation.
  if (before === after && before?.trackingQueries.length === 0) return;
  let queries: Set<QueryInstance> | undefined;
  let tracked: Set<QueryInstance> | undefined;
  let anchored = false;
  for (let i = 0; i < 3; i++) {
    const instance = i === 0 ? before : i === 1 ? after : marker;
    if (instance === undefined) continue;
    if (before !== after) {
      for (const query of instance.queries) (queries ??= new Set()).add(query);
      anchored ||= instance.anchorRelations.length !== 0;
    }
    for (const query of instance.trackingQueries) (tracked ??= new Set()).add(query);
  }
  if (queries === undefined && tracked === undefined && !anchored) return;
  const outerBatch = ctx.queryBatch;
  ctx.queryBatch = [];
  try {
    if (queries)
      for (const query of queries) {
        if (
          !dying &&
          (query.filters === null
            ? matchesQuery(ctx, query, entity)
            : matchesQueryWithFilters(ctx, query, entity))
        )
          addEntityToQuery(query, entity);
        else removeEntityFromQuery(query, entity);
      }
    if (tracked)
      for (const query of tracked) {
        let matches = false;
        for (let i = 0; i < 3; i++) {
          const instance = i === 0 ? before : i === 1 ? after : marker;
          if (instance === undefined) continue;
          matches = checkQueryTracking(
            ctx,
            query,
            entity,
            i === 0 || after === undefined ? 'remove' : 'add',
            instance.generationId,
            instance.bitflag
          );
        }
        if (matches) addEntityToQuery(query, entity);
        else removeEntityFromQuery(query, entity);
      }
    if (anchored)
      for (let i = 0; i < 3; i++) {
        const instance = i === 0 ? before : i === 1 ? after : marker;
        if (instance !== undefined && instance.anchorRelations.length !== 0)
          reconcileAnchoredQueries(ctx, entity, instance, dying);
      }
    flushQueryBatch(ctx);
  } finally {
    ctx.queryBatch = outerBatch;
  }
}

/** Trait removal does not reach the static queries a destroyed entity satisfied without a trait. */
export function exitTraitlessQueries(ctx: WorldContext, entity: Entity) {
  const queries = ctx.notQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (!query.isTracking) removeEntityFromQuery(query, entity);
    else if (query.filters?.tracking && !checkQueryTracking(ctx, query, entity, 'change', -1, 0)) {
      removeEntityFromQuery(query, entity);
    }
  }
}

/**
 * Re-evaluate the anchored queries that read a trait after an event on an entity. The entity can
 * only be in the ones anchored to a target it holds, and a dying entity only leaves them.
 */
function reconcileAnchoredQueries(
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
function reconcileTargetQueries(ctx: WorldContext, entity: Entity, target: Entity, dying: boolean) {
  const targetId = getEntityId(target);
  const queries = ctx.targetQueries[targetId >>> 10]?.[targetId & 1023];
  if (queries === undefined) return;
  for (let i = queries.length - 1; i >= 0; i--) {
    const query = queries[i];
    if (!query.anchored) continue;
    if (!dying && matchesQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
    else removeEntityFromQuery(query, entity);
  }
}

/**
 * Re-evaluate the queries that filter on or track the pairs of a relation after a pair event. A
 * pair write or a dying entity leaves static membership alone and only concerns tracking queries.
 */
export /* @inline */ function reconcileRelationQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity,
  target: Entity,
  eventType: EventType,
  trackingOnly: boolean
): void {
  // Most relations have no such query, so the check stays with the caller and the work is a call.
  if (
    instance.relationQueries.length !== 0 ||
    instance.anchorRelations.length !== 0 ||
    instance.relationQueryIdentifiers !== undefined
  ) {
    reconcilePairQueries(ctx, instance, entity, target, eventType, trackingOnly);
  }
}

/** Exported so the inline guard in reconcileRelationQueries can expand in other modules. */
export function reconcilePairQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity,
  target: Entity,
  eventType: EventType,
  trackingOnly: boolean
): void {
  if (!trackingOnly && instance.anchorRelations.length !== 0) {
    // The entity no longer lists a target it lost, so the queries of that target are named here.
    if (eventType === 'remove') reconcileTargetQueries(ctx, entity, target, false);
    reconcileAnchoredQueries(ctx, entity, instance, false);
  }
  const queries = instance.relationQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let match: boolean;
    if (query.isTracking) {
      match = checkQueryTrackingPair(ctx, query, entity, instance.trait.id, target, eventType);
    } else if (trackingOnly) {
      continue;
    } else {
      match = matchesQueryWithFilters(ctx, query, entity);
    }
    if (match) {
      addEntityToQuery(query, entity);
    } else {
      removeEntityFromQuery(query, entity);
    }
  }
  if (!trackingOnly && instance.relationQueryIdentifiers !== undefined) {
    reconcileIdentifiedRelationQueries(ctx, instance, entity);
  }
}

/** A required local key rules out relation queries for every other name. */
function reconcileIdentifiedRelationQueries(
  ctx: WorldContext,
  instance: TraitInstance,
  entity: Entity
) {
  const eid = getEntityId(entity);
  for (const identifier of instance.relationQueryIdentifiers!) {
    const index = ctx.traitInstances[identifier.id]?.identifier;
    const key = index?.targets[eid >>> 10]?.[eid & 1023];
    if (key === undefined) continue;
    const queries = index!.queries.get(key);
    if (queries === undefined) continue;
    for (const query of queries) {
      const first = query.identifierFilters![0];
      if (first.identifier !== identifier || first.target !== key) continue;
      const pairs = query.filters?.pairs;
      if (pairs === undefined) continue;
      let required = false;
      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].term === 1 && pairs[i].relation[$internal].trait === instance.trait) {
          required = true;
          break;
        }
      }
      if (!required) continue;
      if (matchesQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(query, entity);
    }
  }
}

/**
 * A dying entity only leaves static queries, since losing a forbidden trait must not let it enter
 * one. Tracking queries get the removal, and every pair the entity kept counts as removed.
 */
export function reconcileDyingTraitQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  targets: readonly Entity[] | undefined
) {
  exitStaticQueries(ctx, entity, instance.queries);
  if (targets !== undefined) exitStaticQueries(ctx, entity, instance.relationQueries);
  if (instance.anchorRelations.length !== 0) reconcileAnchoredQueries(ctx, entity, instance, true);
  if (instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(ctx, entity, instance, 'remove');
  }
  if (targets !== undefined && instance.relationQueries.length !== 0) {
    for (const t of targets) reconcileRelationQueries(ctx, instance, entity, t, 'remove', true);
  }
}

function exitStaticQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  for (let i = 0; i < queries.length; i++) {
    if (!queries[i].isTracking) removeEntityFromQuery(queries[i], entity);
  }
}

/** Re-evaluate the queries that include a trait after its membership bit changed. */
export function reconcileTraitQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  eventType: EventType
) {
  if (instance.queries.length !== 0) reconcileQueries(ctx, entity, instance.queries);
  if (instance.anchorRelations.length !== 0) reconcileAnchoredQueries(ctx, entity, instance, false);
  if (instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(ctx, entity, instance, eventType);
  }
}

export function reconcileTrackingQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  eventType: EventType
) {
  // The entity may now pass a static term that deferred its writes.
  if (ctx.defersChanges) clearPendingChanges(ctx, getEntityId(entity));
  const { trackingQueries, generationId, bitflag } = instance;
  for (let i = 0; i < trackingQueries.length; i++) {
    const query = trackingQueries[i];
    const match = checkQueryTracking(ctx, query, entity, eventType, generationId, bitflag);
    if (match) addEntityToQuery(query, entity);
    else removeEntityFromQuery(query, entity);
  }
}

/** A target entering or leaving its filter can change the membership of each source. */
export function reconcileTargetFilter(
  ctx: WorldContext,
  query: QueryInstance,
  pair: ResolvedRelationFilter,
  target: Entity,
  eventType: 'add' | 'remove'
) {
  const sources = getRelationSources(ctx, pair.relation, target);
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    // A source holds the filtered pair while its target matches, so for a tracked pair the
    // target entering or leaving is the pair's add or remove event. For any other term it
    // only changes whether the source passes.
    const match = !query.isTracking
      ? matchesQueryWithFilters(ctx, query, source)
      : pair.term === 4
        ? checkQueryTrackingFilter(ctx, query, source, pair, eventType)
        : checkQueryTracking(ctx, query, source, 'change', 0, 0);
    if (match) {
      addEntityToQuery(query, source);
    } else {
      removeEntityFromQuery(query, source);
    }
  }
}
