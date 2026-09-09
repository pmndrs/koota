import { createPageAllocator } from './entity/page-allocator';
import type { Query } from './query/types';
import type { KernelContext } from './context';

function createInitialState() {
  const allocator = createPageAllocator();
  return {
    contexts: [] as (KernelContext | null)[],
    pageOwners: allocator.pageOwners,
    cachedQueries: new Map<string, Query<any>>(),
    pageAllocator: allocator,
  };
}

export const universe = {
  .../* @__PURE__ */ createInitialState(),
  reset: () => {
    const fresh = createInitialState();
    universe.contexts = fresh.contexts;
    universe.pageOwners = fresh.pageOwners;
    universe.cachedQueries = fresh.cachedQueries;
    universe.pageAllocator = fresh.pageAllocator;
  },
};
