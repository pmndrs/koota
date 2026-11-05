import { isEntityAlive } from '../../entity/utils/entity-index';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { DESTROYED_WORD } from '../../entity/utils/paged-mask';
import { hasRelationPair, hasRelationTargetInSet } from '../../relation/relation';
import type { WorldContext } from '../../world';
import type { QueryInstance, ResolvedRelationFilter } from '../types';
import { checkQuery } from './check-query';

export function checkQueryWithFilters(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity
): boolean {
  return checkQuery(ctx, query, entity) && passesQueryFilters(ctx, query, entity);
}

/**
 * The entity satisfies every relation filter of the query, read from the targets it keeps. A
 * required pair must be held and a forbidden pair must not. Or traits, pairs and negated branches
 * share one disjunction. A matching tracked alternative can satisfy that disjunction too.
 */
export function passesQueryFilters(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity,
  orMatched = false
): boolean {
  const orFilters = query.filters!;
  const filters = orFilters.pairs;
  let or = orMatched || orFilters.orMasks === null;
  // Static alternatives cannot keep dead entities alive in later tracking batches.
  if (!or && orFilters.tracking === 'or' && !isEntityAlive(ctx.entityIndex, entity)) return false;

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    if (filter.term >= 4 || (or && filter.term === 3)) continue;
    const held = holdsFilterPair(ctx, entity, filter);
    if (filter.term === 3) {
      if (held) or = true;
    } else if (held !== (filter.term === 1)) {
      return false;
    }
  }

  if (or) return true;
  if (matchesOrMasks(ctx, orFilters.orMasks!, getEntityId(entity), query.retains)) return true;
  const branches = orFilters.not;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    if (holdsForbiddenTrait(ctx, branch.masks, pageId, slot, query.retains)) continue;
    let held = false;
    for (let j = 0; j < branch.pairs.length; j++) {
      if (holdsFilterPair(ctx, entity, branch.pairs[j])) {
        held = true;
        break;
      }
    }
    if (!held) return true;
  }
  return false;
}

/** A negated branch fails as soon as one of its traits is present. */
function holdsForbiddenTrait(
  ctx: WorldContext,
  masks: number[],
  pageId: number,
  slot: number,
  retained: boolean
) {
  for (let i = 0; i < masks.length; i += 4) {
    const page = ctx.entityMasks[masks[i]][pageId];
    const held = retained ? page[slot] | page[slot + DESTROYED_WORD] : page[slot];
    if ((held & masks[i + 2]) !== 0) return true;
  }
  return false;
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

/** Any held positive bit or absent negative bit satisfies the disjunction. */
function matchesOrMasks(ctx: WorldContext, orMasks: number[], eid: number, retained: boolean) {
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  for (let i = 0; i < orMasks.length; i += 4) {
    const page = ctx.entityMasks[orMasks[i]][pageId];
    const held = retained ? page[slot] | page[slot + DESTROYED_WORD] : page[slot];
    const absent = orMasks[i + 2];
    if ((held & orMasks[i + 3]) !== 0 || (held & absent) !== absent) return true;
  }
  return false;
}
