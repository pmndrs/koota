import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { createColumn } from '../storage/stores';
import type { Store } from '../storage/types';
import type { EntitySource, ViewBinding } from '../view/types';
import type {
  QueryInstance,
  QueryLayout,
  QueryLayoutCache,
  QueryPage,
  QueryPageBuilder,
} from './types';

const EMPTY_LAYOUT_CACHE: QueryLayoutCache = {
  version: -1,
  pageCount: 0,
  pageIds: new Uint32Array(0),
  pageStarts: new Uint32Array(0),
  pageCounts: new Uint16Array(0),
  offsets: new Uint16Array(0),
  entities: [],
};

function ensureQueryLayout(
  query: QueryInstance,
  entities: readonly number[],
  length: number
): QueryLayout {
  // Membership changes bump the version and a tracking batch swap clears the cache.
  const cache = query.layoutCache;
  if (cache && cache.version === query.version) return cache;

  const next = createQueryLayout(entities, length, query.version);
  query.layoutCache = next;
  return next;
}

function createQueryLayout(
  entities: readonly number[],
  length: number,
  version: number
): QueryLayoutCache {
  if (length === 0) return EMPTY_LAYOUT_CACHE;

  const pagesById = new Map<number, QueryPageBuilder>();

  for (let i = 0; i < length; i++) {
    const entity = entities[i] as Entity;
    const eid = getEntityId(entity);
    const pageId = eid >>> 10;

    let page = pagesById.get(pageId);
    if (!page) {
      page = {
        pageId,
        offsets: [],
        entities: [],
      };
      pagesById.set(pageId, page);
    }

    page.offsets.push(eid & 1023);
    page.entities.push(entity);
  }

  const orderedPages = Array.from(pagesById.values()).sort((a, b) => a.pageId - b.pageId);
  const pageCount = orderedPages.length;
  const pageIds = new Uint32Array(pageCount);
  const pageStarts = new Uint32Array(pageCount);
  const pageCounts = new Uint16Array(pageCount);

  let flatIndex = 0;
  for (let i = 0; i < pageCount; i++) {
    const page = orderedPages[i];
    pageIds[i] = page.pageId;
    pageStarts[i] = flatIndex;
    pageCounts[i] = page.offsets.length;
    flatIndex += page.offsets.length;
  }

  const offsets = new Uint16Array(flatIndex);
  const orderedEntities = new Array<Entity>(flatIndex);

  let offsetIndex = 0;
  for (let i = 0; i < pageCount; i++) {
    const page = orderedPages[i];
    for (let j = 0; j < page.offsets.length; j++) {
      offsets[offsetIndex] = page.offsets[j];
      orderedEntities[offsetIndex] = page.entities[j];
      offsetIndex++;
    }
  }

  return {
    version,
    pageCount,
    pageIds,
    pageStarts,
    pageCounts,
    offsets,
    entities: orderedEntities,
  };
}

// Each layout can serve multiple query parameter orders and selections.
const pageCaches = new WeakMap<QueryLayout, { stores: Store<any>[]; pages: QueryPage<any>[] }[]>();

export function getQueryPages(
  query: QueryInstance,
  source: EntitySource,
  binding: ViewBinding
): QueryPage<any>[] {
  const { traits, stores } = binding;
  const layout = ensureQueryLayout(query, source.dense, source.length);
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
    const pageStores = stores.map((store, i) => {
      // Materialize missing pages so later trait additions use the same arrays.
      if (Array.isArray(store)) return (store[id] ??= []);
      const schema = traits[i].schema as Record<string, unknown>;
      const page: Record<string, unknown[]> = {};
      for (const key in store) page[key] = store[key][id] ??= createColumn(schema[key]);
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
