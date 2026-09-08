import { createArchetypeGraph } from '../archetype/archetype-graph';
import { createPageAllocator } from '../entity/utils/page-allocator';
import { resetModifiers } from '../query/modifier';
import type { Query } from '../query/types';
import { resetQueryFilters } from '../query/utils/create-query-hash';
import type { WorldContext } from '../world';

function createInitialState() {
  const allocator = createPageAllocator((worldId) => {
    delete universe.worlds[worldId];
  });
  return {
    worlds: [] as (WorldContext | null)[],
    pageOwners: allocator.pageOwners,
    archetypes: createArchetypeGraph(),
    cachedQueries: new Map<string, Query<any>[]>(),
    pageAllocator: allocator,
  };
}

export const universe = {
  ...createInitialState(),
  reset: () => {
    const fresh = createInitialState();
    universe.worlds = fresh.worlds;
    universe.pageOwners = fresh.pageOwners;
    universe.archetypes = fresh.archetypes;
    universe.cachedQueries = fresh.cachedQueries;
    resetQueryFilters();
    resetModifiers();
    universe.pageAllocator = fresh.pageAllocator;
  },
};
