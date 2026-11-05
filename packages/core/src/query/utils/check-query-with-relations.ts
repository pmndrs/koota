import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { DESTROYED_WORD } from '../../entity/utils/paged-mask';
import { hasRelationPair, hasRelationTargetInSet } from '../../relation/relation';
import type { WorldContext } from '../../world';
import type { QueryInstance, ResolvedRelationFilter } from '../types';
import { checkQuery } from './check-query';

export function checkQueryWithRelations(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity
): boolean {
  return checkQuery(ctx, query, entity) && passesRelationFilters(ctx, query, entity);
}

/**
 * The entity satisfies every relation filter of the query, read from the targets it keeps. A
 * required pair must be held and a forbidden pair must not. Or pairs share one term with the or
 * traits, which passes when the entity holds any of them. Tracked pairs match on their events.
 */
export function passesRelationFilters(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity
): boolean {
  const filters = query.relationFilters;
  const orMasks = query.orMasks;
  let or = orMasks === null;

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    if (filter.term === 4) continue;
    const held = holdsFilterPair(ctx, entity, filter);
    if (filter.term === 3) {
      if (held) or = true;
    } else if (held !== (filter.term === 1)) {
      return false;
    }
  }

  return or || holdsOrTrait(ctx, orMasks!, getEntityId(entity), query.retains);
}

/** The entity holds the filter's pair, among the targets it has or kept when it was destroyed. */
export /* @inline @pure */ function holdsFilterPair(
  ctx: WorldContext,
  entity: Entity,
  filter: ResolvedRelationFilter
): boolean {
  const matches = filter.targetQueryMatches;
  return matches !== undefined
    ? hasRelationTargetInSet(ctx, filter.relation, entity, matches)
    : hasRelationPair(ctx, entity, filter);
}

/** A Removed query also reads the traits a dead entity died with, as its static masks do. */
function holdsOrTrait(ctx: WorldContext, orMasks: number[], eid: number, retained: boolean) {
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  for (let i = 0; i < orMasks.length; i += 4) {
    const page = ctx.entityMasks[orMasks[i]][pageId];
    const held = retained ? page[slot] | page[slot + DESTROYED_WORD] : page[slot];
    if ((held & orMasks[i + 3]) !== 0) return true;
  }
  return false;
}
