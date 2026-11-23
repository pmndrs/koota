import { matchesIdentifiers } from '../../identifier/identifier';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { DESTROYED_WORD } from '../../world/utils/entity-masks';
import type { WorldContext } from '../../world';
import type { QueryInstance } from '../types';

export function checkQuery(ctx: WorldContext, query: QueryInstance, entity: Entity): boolean {
  if (
    query.identifierFilters !== undefined &&
    !matchesIdentifiers(ctx, entity, query.identifierFilters)
  ) {
    return false;
  }
  return passesStaticMasks(query.masks, ctx.entityMasks, getEntityId(entity));
}

export function passesStaticMasks(masks: number[], entityMasks: Uint32Array[][], eid: number) {
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
