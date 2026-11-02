import type { WorldContext } from '../../world/types';
import type { Entity } from '../types';
import { createPageAllocator } from './page-allocator';
import { getEntityId } from './pack-entity';

/**
 * The one structure worlds share. An entity is a number, so the page that holds its id is how
 * its methods find the world that owns it. Nothing else lives here. Each world keeps its own
 * state and the program's definitions carry their own ids.
 */
export const addressSpace = createPageAllocator();

/** The world that owns the entity, or null when its page has been released. */
export function resolveWorld(entity: Entity): WorldContext | null {
  return addressSpace.pageOwners[getEntityId(entity) >>> 10];
}
