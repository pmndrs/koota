import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { REMOVED_WORD } from '../entity/utils/paged-mask';
import type { WorldContext } from '../world/types';
import type { QueryInstance } from './types';
import { addEntityToQuery, removeEntityFromQuery } from './query';
import { checkQuery, matchesMaskWord } from './utils/check-query';
import { passesQueryFilters } from './utils/check-query-filters';

/** Actions follow the trait's query list in order. An index adds and its bitwise complement removes. */
type Transition = { everHeld: number; actions: number[] };
type TransitionCache = { generation: number; mask: number; byWord: Map<number, Transition> };

// Null disables caching for this list until its contents change.
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

/** A query can only contain an entity that has held its positive terms. */
function compileTransition(queries: QueryInstance[], held: number, everHeld: number): Transition {
  const actions: number[] = [];
  for (let i = 0; i < queries.length; i++) {
    const [, required, forbidden, or] = queries[i].masks;
    if (matchesMaskWord(everHeld, required, 0, or)) {
      actions.push(matchesMaskWord(held, required, forbidden, or) ? i : ~i);
    }
  }
  return { everHeld, actions };
}

/** Returns the original list length covered by the plan, or zero for direct matching. */
function applyQueryTransition(
  ctx: WorldContext,
  entity: Entity,
  queries: QueryInstance[],
  cache: TransitionCache | undefined
) {
  if (cache === undefined) {
    const created = createTransitionCache(queries);
    transitions.set(queries, created);
    if (created === null) return 0;
    cache = created;
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
      transitions.set(queries, null);
      return 0;
    }
    // Widen the possible removals across entities that share their current traits.
    transition = compileTransition(queries, held, everHeld | (transition?.everHeld ?? 0));
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
  if (queries.length >= 4) {
    const cache = transitions.get(queries);
    if (cache !== null) start = applyQueryTransition(ctx, entity, queries, cache);
  }
  // A subscriber can append queries while the cached prefix is being walked.
  for (let i = start; i < queries.length; i++) {
    const query = queries[i];
    if (
      checkQuery(ctx, query, entity) &&
      (query.filters === null || passesQueryFilters(ctx, query, entity))
    ) {
      addEntityToQuery(query, entity);
    } else removeEntityFromQuery(query, entity);
  }
}
