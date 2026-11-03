import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import type { WorldContext } from '../../world';
import type { QueryInstance } from '../types';

export function checkQuery(ctx: WorldContext, query: QueryInstance, entity: Entity): boolean {
  if (query.name !== undefined && (query.name === null || ctx.names.get(query.name) !== entity)) {
    return false;
  }
  return passesStaticMasks(query.masks, ctx.entityMasks, getEntityId(entity));
}

/** The entity satisfies every required, forbidden and or mask of the query. */
export function passesStaticMasks(masks: number[], entityMasks: Uint32Array[][], eid: number) {
  if (masks.length === 0) return false;
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  for (let i = 0; i < masks.length; i += 4) {
    const entityMask = entityMasks[masks[i]][pageId][offset];
    const required = masks[i + 1];
    const forbidden = masks[i + 2];
    const or = masks[i + 3];
    if (forbidden !== 0 && (entityMask & forbidden) !== 0) return false;
    if (required !== 0 && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  return true;
}
