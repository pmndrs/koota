import { createPageAllocator } from '../entity/utils/page-allocator';
import type { Query } from '../query/types';
import type { WorldContext } from '../world';

function createInitialState() {
    const allocator = createPageAllocator((worldId) => {
        delete universe.worlds[worldId];
    });
    return {
        worlds: [] as (WorldContext | null)[],
        pageOwners: allocator.pageOwners,
        cachedQueries: new Map<string, Query<any>>(),
        pageAllocator: allocator,
    };
}

export const universe = {
    ...createInitialState(),
    reset: () => {
        const fresh = createInitialState();
        universe.worlds = fresh.worlds;
        universe.pageOwners = fresh.pageOwners;
        universe.cachedQueries = fresh.cachedQueries;
        universe.pageAllocator = fresh.pageAllocator;
    },
};
