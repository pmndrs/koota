import { isEntityAlive } from '../entity/entity-index';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/pack-entity';
import type { KernelContext } from '../context';
import type { QueryInstance } from './types';

export function checkQuery(ctx: KernelContext, query: QueryInstance, entity: Entity): boolean {
  if (ctx.implicitEntities.has(entity)) return false;
  const identities = query.identities;
  if (identities)
    for (let i = 0; i < identities.length; i++)
      if (!isEntityAlive(ctx.entityIndex, identities[i])) return false;
  const staticBitmasks = query.staticBitmasks;
  const generations = query.generations;
  const eid = getEntityId(entity);

  for (let i = 0; i < generations.length; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;

    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const entityMask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];

    if (!forbidden && !required && !or) return false;
    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }

  return true;
}
