import type { KernelContext } from '../context';
import { universe } from '../universe';
import { getEntityId } from './pack-entity';
import { isEntityAlive } from './entity-index';

export function getEntityContext(entity: number): KernelContext | undefined {
  return universe.pageOwners[getEntityId(entity) >>> 10] ?? undefined;
}

export function hasEntity(ctx: KernelContext, entity: number): boolean {
  return isEntityAlive(ctx.entityIndex, entity);
}

export function isEntityHandleAlive(entity: number): boolean {
  const ctx = getEntityContext(entity);
  if (ctx === undefined) return false;
  return isEntityAlive(ctx.entityIndex, entity);
}
