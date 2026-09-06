import type { Store } from '../storage';
import type { QueryLayout, QueryPage } from './types';

// Each layout can serve multiple query parameter orders and selections.
const pageCaches = new WeakMap<QueryLayout, { stores: Store<any>[]; pages: QueryPage<any>[] }[]>();

export function getQueryPages(stores: Store<any>[], layout: QueryLayout): QueryPage<any>[] {
  if (layout.pageCount === 0) return [];

  let cache = pageCaches.get(layout);
  if (cache) {
    for (const entry of cache) {
      if (entry.stores.length !== stores.length) continue;
      if (entry.stores.every((store, i) => store === stores[i])) return entry.pages;
    }
  } else {
    cache = [];
    pageCaches.set(layout, cache);
  }

  const pages: QueryPage<any>[] = [];
  for (let p = 0; p < layout.pageCount; p++) {
    const id = layout.pageIds[p];
    const start = layout.pageStarts[p];
    const end = start + layout.pageCounts[p];
    const pageStores = stores.map((store) => {
      // Materialize missing pages so later trait additions use the same arrays.
      if (Array.isArray(store)) return (store[id] ??= []);
      const page: Record<string, unknown[]> = {};
      for (const key in store) page[key] = store[key][id] ??= [];
      return page;
    });
    pages.push({
      index: p,
      stores: pageStores as QueryPage<any>['stores'],
      indices: layout.offsets.subarray(start, end),
      entities: layout.entities.slice(start, end),
    });
  }

  cache.push({ stores: stores.slice(), pages });
  return pages;
}
