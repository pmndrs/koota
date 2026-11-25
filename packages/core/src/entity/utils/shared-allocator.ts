import type { WorldContext } from '../../world/types';
import type { Entity } from '../types';
import { getEntityId } from './pack-entity';
import { createPageAllocator } from './page-allocator';

/**
 * The one structure worlds with entity methods share. An entity is a number, so the page that
 * holds its id is how a method finds the world that owns it. The table holds each world until it
 * is destroyed, which is what an isolated world avoids by owning its ids.
 */
export const sharedPageOwners: (WorldContext | null)[] = [];
export const sharedAllocator = /* @__PURE__ */ createPageAllocator(sharedPageOwners);

/** The world that owns a live entity of a world with entity methods. */
export /* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return sharedPageOwners[getEntityId(entity) >>> 10]!;
}
