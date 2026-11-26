import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { REMOVED_WORD } from '../world/utils/entity-masks';
import type { WorldContext } from '../world/types';
import type { QueryInstance } from './types';
import { addEntityToQuery, removeEntityFromQuery } from './query';
import { checkQuery, matchesMaskWord } from './utils/check-query';
import { passesQueryFilters } from './utils/check-query-filters';

/** Actions follow the trait's query list in order. An index adds and its bitwise complement removes. */
type Transition = { everHeld: number; actions: number[] };
type TransitionCache = { generation: number; mask: number; byWord: Map<number, Transition> | null };

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
  return cache === null ? 0 : applyQueryTransition(ctx, entity, queries, cache);
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
function applyQueryTransition(
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

export function reconcileQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  // A query a subscriber registers during the walk is filled as it is made, so the walk covers only
  // the queries the list held when the event arrived.
  const count = queries.length;
  const start = count < 4 ? 0 : reconcileCachedQueries(ctx, entity, queries);
  for (let i = start; i < count; i++) {
    const query = queries[i];
    // A subscriber can also drop a query, which shortens the list.
    if (query === undefined) return;
    if (
      checkQuery(ctx, query, entity) &&
      (query.filters === null || passesQueryFilters(ctx, query, entity))
    ) {
      addEntityToQuery(query, entity);
    } else removeEntityFromQuery(query, entity);
  }
}
