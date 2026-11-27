import { isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { hasIdentifier } from '../identifier/ownership';
import type { IdentifierPair } from '../identifier/types';
import { hasRelationPair, hasRelationTargetInSet } from '../relation/targets';
import { DESTROYED_WORD } from '../trait/membership';
import type { WorldContext } from '../world/types';
import type { QueryInstance, ResolvedRelationFilter } from './types';

export function matchesQuery(ctx: WorldContext, query: QueryInstance, entity: Entity): boolean {
  if (
    query.identifierFilters !== undefined &&
    !matchesIdentifiers(ctx, entity, query.identifierFilters)
  ) {
    return false;
  }
  return matchesQueryMasks(query.masks, ctx.entityMasks, getEntityId(entity));
}

export function matchesQueryMasks(masks: number[], entityMasks: Uint32Array[][], eid: number) {
  if (masks.length === 0) return false;
  return matchesStaticMasks(masks, entityMasks, eid >>> 10, (eid & 1023) << 2, false);
}

/** Tests the required, forbidden and alternative bits in a single membership word. */
export /* @inline @pure */ function matchesMaskWord(
  word: number,
  required: number,
  forbidden: number,
  or: number
) {
  return (
    (word & required) === required && (word & forbidden) === 0 && (or === 0 || (word & or) !== 0)
  );
}

/** All required bits, no forbidden bits, and any Or bit across generations. Retained rows include the traits held at destruction. */
export /* @inline @pure */ function matchesStaticMasks(
  masks: number[],
  entityMasks: Uint32Array[][],
  pageId: number,
  slot: number,
  retained: boolean
): boolean {
  let hasOr = false;
  let orMatched = false;
  for (let i = 0; i < masks.length; i += 4) {
    const required = masks[i + 1];
    const forbidden = masks[i + 2];
    const or = masks[i + 3];
    const page = entityMasks[masks[i]][pageId];
    const entityMask = retained ? page[slot] | page[slot + DESTROYED_WORD] : page[slot];

    if (forbidden !== 0 && (entityMask & forbidden) !== 0) return false;
    if (required !== 0 && (entityMask & required) !== required) return false;
    if (or !== 0) {
      hasOr = true;
      if ((entityMask & or) !== 0) orMatched = true;
    }
  }
  return !hasOr || orMatched;
}

export function matchesIdentifiers(
  ctx: WorldContext,
  entity: Entity,
  pairs: IdentifierPair[]
): boolean {
  for (let i = 0; i < pairs.length; i++) {
    if (!hasIdentifier(ctx, entity, pairs[i])) return false;
  }
  return true;
}

export function matchesQueryWithFilters(
  ctx: WorldContext,
  query: QueryInstance,
  entity: Entity
): boolean {
  return matchesQuery(ctx, query, entity) && matchesQueryFilters(ctx, query, entity);
}

/**
 * The entity satisfies every relation filter of the query, read from the targets it keeps. A
 * required pair must be held and a forbidden pair must not. Or traits, pairs and negated branches
 * share one disjunction. A matching tracked alternative can satisfy that disjunction too.
 */
export function matchesQueryFilters(
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
    const held = hasFilterPair(ctx, entity, filter);
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
    if (hasForbiddenTrait(ctx, branch.masks, pageId, slot, query.retains)) continue;
    let held = false;
    for (let j = 0; j < branch.pairs.length; j++) {
      if (hasFilterPair(ctx, entity, branch.pairs[j])) {
        held = true;
        break;
      }
    }
    if (!held) return true;
  }
  return false;
}

/** A negated branch fails as soon as one of its traits is present. */
function hasForbiddenTrait(
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
export /* @inline @pure */ function hasFilterPair(
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
