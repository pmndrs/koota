import type { SparseSet } from '@koota/collections';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import type { WorldContext } from '../world';
import type { Trait } from '../trait/types';
import { EntityView, getQueryBinding, type EntitySource } from '../view/entity-view';
import { sortView } from '../view/ordered-view';
import type { EntityComparator } from '../view/types';
import { getQueryPages } from './query-pages';
import type {
  QueryInstance,
  QueryLayout,
  QueryLayoutCache,
  QueryParameter,
  QueryPage,
  QueryView,
  QueryViewBinding,
} from './types';

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- Fields initialize below and traversal methods come from EntityView.prototype.
interface View extends EntityView {}

class View implements QueryView<any> {
  ctx: WorldContext;
  query: QueryInstance | null;
  binding: QueryViewBinding;
  source: EntitySource;
  live: boolean;
  layout: QueryLayout | undefined;

  constructor(
    ctx: WorldContext,
    query: QueryInstance | null,
    binding: QueryViewBinding,
    source: EntitySource,
    live: boolean
  ) {
    this.ctx = ctx;
    this.query = query;
    this.binding = binding;
    this.source = source;
    this.live = live;
    this.layout = undefined;
  }

  get length() {
    return this.source.length;
  }

  sort(compare: EntityComparator, deps: readonly Trait[] = []) {
    return sortView(this, compare, deps);
  }

  getPages() {
    const { query, binding } = this;
    const { dense, length } = this.source;
    let layout: QueryLayout;
    if (!this.live) layout = this.layout ??= createQueryLayout(dense, length);
    else layout = getCachedQueryLayout(query!, dense, length);
    return getQueryPages(binding.traits, binding.stores, layout) as QueryPage<any>[];
  }

  /** Views are cached per binding on the query, so selecting every frame allocates nothing. */
  select<U extends QueryParameter[]>(...params: U): QueryView<U> {
    const binding = getQueryBinding(this.ctx, this.query, params);
    if (binding === this.binding) return this as unknown as QueryView<U>;
    const view = this.live
      ? getLiveView(this.ctx, this.query!, binding)
      : new View(this.ctx, this.query, binding, this.source, false);
    return view as unknown as QueryView<U>;
  }
}

// Share traversal methods without a second constructor on the query allocation path.
Object.setPrototypeOf(View.prototype, EntityView.prototype);

/** Creates the view a query exposes for a binding. Live views follow the exposed set on each run. */
function getLiveView(ctx: WorldContext, query: QueryInstance, binding: QueryViewBinding) {
  let view = binding.view as View | null;
  if (view === null) {
    view = new View(ctx, query, binding, query.exposed, true);
    binding.view = view;
  }
  return view;
}

/** Resolves the live view for this run's parameters. */
export function bindQueryView(
  ctx: WorldContext,
  query: QueryInstance,
  params: QueryParameter[]
): QueryView<any> {
  const binding = query.viewBindings[0];
  if (binding !== undefined && binding.params === params && binding.view !== null) {
    return binding.view;
  }
  return getLiveView(ctx, query, getQueryBinding(ctx, query, params));
}

/** Points every live view of a tracking query at the batch it now exposes. */
export function exposeQuerySet(query: QueryInstance, set: SparseSet) {
  // Batch sets are reused, so array identity cannot identify their contents.
  query.layoutCache = null;
  query.version++;
  query.exposed = set;
  const bindings = query.viewBindings;
  for (let i = 0; i < bindings.length; i++) {
    const view = bindings[i].view as View | null;
    if (view !== null) view.source = set;
  }
}

/** Wraps an entity array the caller owns, such as a lookup result, as a view that never changes. */
export function createOwnedView<T extends QueryParameter[]>(
  ctx: WorldContext,
  entities: Entity[],
  query: QueryInstance | null,
  params: QueryParameter[]
): QueryView<T> {
  const binding = getQueryBinding(ctx, query, params);
  return new View(
    ctx,
    query,
    binding,
    { dense: entities, length: entities.length },
    false
  ) as unknown as QueryView<T>;
}

type QueryPageBuilder = {
  pageId: number;
  offsets: number[];
  entities: Entity[];
};

const EMPTY_LAYOUT_CACHE: QueryLayoutCache = {
  version: -1,
  pageCount: 0,
  pageIds: new Uint32Array(0),
  pageStarts: new Uint32Array(0),
  pageCounts: new Uint16Array(0),
  offsets: new Uint16Array(0),
  entities: [],
};

function getCachedQueryLayout(
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
  version = EMPTY_LAYOUT_CACHE.version
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
