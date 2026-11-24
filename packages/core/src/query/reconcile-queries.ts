import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { REMOVED_WORD } from '../entity/utils/paged-mask';
import type { WorldContext } from '../world/types';
import type { QueryInstance } from './types';
import { addEntityToQuery, removeEntityFromQuery } from './query';
import { checkQuery } from './utils/check-query';
import { checkQueryWithFilters } from './utils/check-query-filters';

/** Actions follow the trait's query list in order. An index adds and its bitwise complement removes. */
type Transition = { everHeld: number; actions: number[] };
type TransitionCache = { generation: number; mask: number; byWord: Map<number, Transition> };

// Null marks a changed list for lazy compilation. Unlisted queries use the ordinary matcher.
const transitions = new WeakMap<QueryInstance[], TransitionCache | null>();
const minQueriesForCache = 4;

export function invalidateQueryTransitions(queries: QueryInstance[]) {
  if (queries.length >= minQueriesForCache) transitions.set(queries, null);
  else transitions.delete(queries);
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

/** A query can only contain an entity that has held its positive terms. */
function compileTransition(
  ctx: WorldContext,
  entity: Entity,
  queries: QueryInstance[],
  everHeld: number
): Transition {
  const actions: number[] = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const [, required, , or] = query.masks;
    if ((everHeld & required) !== required || (or !== 0 && (everHeld & or) === 0)) continue;
    actions.push(checkQuery(ctx, query, entity) ? i : ~i);
  }
  return { everHeld, actions };
}

function applyQueryTransition(
  ctx: WorldContext,
  entity: Entity,
  queries: QueryInstance[],
  cache: TransitionCache | null
) {
  if (cache === null) {
    cache = createTransitionCache(queries);
    if (cache === null) {
      transitions.delete(queries);
      return 0;
    }
    transitions.set(queries, cache);
  }
  const eid = getEntityId(entity);
  const page = ctx.entityMasks[cache.generation][eid >>> 10];
  const slot = (eid & 1023) << 2;
  const held = page[slot] & cache.mask;
  const everHeld = (held | page[slot + REMOVED_WORD]) & cache.mask;
  let transition = cache.byWord.get(held);
  if (transition === undefined || (everHeld & ~transition.everHeld) !== 0) {
    if (transition === undefined && cache.byWord.size === 128) {
      // Stop compiling when the list sees too many distinct combinations.
      transitions.delete(queries);
      return 0;
    }
    // Widen the possible removals across entities that share their current traits.
    transition = compileTransition(ctx, entity, queries, everHeld | (transition?.everHeld ?? 0));
    cache.byWord.set(held, transition);
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

export function reconcileQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  let start = 0;
  if (queries.length >= minQueriesForCache) {
    const cache = transitions.get(queries);
    if (cache !== undefined) start = applyQueryTransition(ctx, entity, queries, cache);
  }
  // A subscriber can append queries while the cached prefix is being walked.
  for (let i = start; i < queries.length; i++) {
    const query = queries[i];
    if (query.filters !== null) {
      if (checkQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(query, entity);
    } else {
      if (checkQuery(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(query, entity);
    }
  }
}
