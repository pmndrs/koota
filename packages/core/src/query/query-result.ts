import type { SparseSet } from '@koota/collections';
import { $internal } from '../common';
import { isNameConfig } from '../name/name-index';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isEntityAlive } from '../entity/utils/entity-index';
import { isRelationPair } from '../relation/utils/is-relation';
import { Store } from '../storage';
import { registerTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { hasSubscribers } from '../trait/subscriptions';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import { isModifier } from './modifier';
import { notifyChanged } from './modifiers/changed';
import { getQueryPages } from './query-pages';
import { getQueryIterators } from './utils/compile-iterators';
import type {
  QueryInstance,
  QueryIterationBuffers,
  QueryLayout,
  QueryLayoutCache,
  QueryParameter,
  QueryPage,
  QueryResult,
  QueryResultBinding,
  QueryResultOptions,
} from './types';

/** The entity list behind a result. A live result reads its query's sparse set in place. */
type EntitySource = { readonly dense: readonly number[]; readonly length: number };

type Callback = (state: any, entity: Entity, index: number) => void;
type EntityCallback<R> = (entity: Entity, index: number) => R;

/** An entity array a result owns, such as a sorted copy or a lookup. */
class Snapshot implements EntitySource {
  dense: Entity[];
  length: number;

  constructor(entities: Entity[]) {
    this.dense = entities;
    this.length = entities.length;
  }
}

/**
 * Array like view over a query's entities. Views are not arrays, so they can read the sparse set
 * in place without disturbing V8's array fast paths, and every walk holds the query's iteration
 * guard so pending removals wait until the walk ends.
 */
class QueryResultView implements QueryResult<any> {
  ctx: WorldContext;
  /** Null for lookups that bypass a query instance, such as named and relation fast paths. */
  query: QueryInstance | null;
  binding: QueryResultBinding;
  source: EntitySource;
  live: boolean;
  /** Snapshots memoize their page layout. Live views use the query's versioned cache. */
  layout: QueryLayout | undefined;
  /** Pooled iterator so for..of allocates nothing in steady state. */
  iterator: ResultIterator | undefined;

  constructor(
    ctx: WorldContext,
    query: QueryInstance | null,
    binding: QueryResultBinding,
    source: EntitySource,
    live: boolean
  ) {
    this.ctx = ctx;
    this.query = query;
    this.binding = binding;
    this.source = source;
    this.live = live;
    this.layout = undefined;
    this.iterator = undefined;
  }

  get length() {
    return this.source.length;
  }

  at(index: number): Entity | undefined {
    const { dense, length } = this.source;
    if (index < 0) index += length;
    return index >= 0 && index < length ? (dense[index] as Entity) : undefined;
  }

  [Symbol.iterator](): IterableIterator<Entity> {
    const iterator = this.iterator ?? new ResultIterator(this);
    this.iterator = undefined;
    return iterator.start() as unknown as IterableIterator<Entity>;
  }

  forEach(callback: EntityCallback<void>) {
    const { dense, length } = this.source;
    const guard = this.live ? this.query! : null;
    if (guard) guard.iterating++;
    try {
      for (let i = 0; i < length; i++) callback(dense[i] as Entity, i);
    } finally {
      if (guard) guard.iterating--;
    }
  }

  map<U>(callback: EntityCallback<U>): U[] {
    const { dense, length } = this.source;
    const out = new Array<U>(length);
    const guard = this.live ? this.query! : null;
    if (guard) guard.iterating++;
    try {
      for (let i = 0; i < length; i++) out[i] = callback(dense[i] as Entity, i);
    } finally {
      if (guard) guard.iterating--;
    }
    return out;
  }

  filter(callback: EntityCallback<unknown>): Entity[] {
    const { dense, length } = this.source;
    const out: Entity[] = [];
    const guard = this.live ? this.query! : null;
    if (guard) guard.iterating++;
    try {
      for (let i = 0; i < length; i++) {
        const entity = dense[i] as Entity;
        if (callback(entity, i)) out.push(entity);
      }
    } finally {
      if (guard) guard.iterating--;
    }
    return out;
  }

  find(callback: EntityCallback<unknown>): Entity | undefined {
    const { dense, length } = this.source;
    const guard = this.live ? this.query! : null;
    if (guard) guard.iterating++;
    try {
      for (let i = 0; i < length; i++) {
        const entity = dense[i] as Entity;
        if (callback(entity, i)) return entity;
      }
      return undefined;
    } finally {
      if (guard) guard.iterating--;
    }
  }

  some(callback: EntityCallback<unknown>): boolean {
    return this.find(callback) !== undefined;
  }

  every(callback: EntityCallback<unknown>): boolean {
    const { dense, length } = this.source;
    const guard = this.live ? this.query! : null;
    if (guard) guard.iterating++;
    try {
      for (let i = 0; i < length; i++) if (!callback(dense[i] as Entity, i)) return false;
      return true;
    } finally {
      if (guard) guard.iterating--;
    }
  }

  indexOf(entity: Entity): number {
    const { dense, length } = this.source;
    for (let i = 0; i < length; i++) if (dense[i] === entity) return i;
    return -1;
  }

  includes(entity: Entity): boolean {
    return this.indexOf(entity) !== -1;
  }

  toArray(): Entity[] {
    return this.source.dense.slice(0, this.source.length) as Entity[];
  }

  sort(callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)) {
    const copy = this.toArray().sort(callback);
    return new QueryResultView(this.ctx, this.query, this.binding, new Snapshot(copy), false);
  }

  readEach(callback: Callback) {
    const { dense, length } = this.source;
    if (length === 0) return this;
    const { ctx, query, live } = this;
    const { traits, stores } = this.binding;
    const pool = query ?? ctx;
    const buffers = takeIterationBuffers(ctx, pool, dense as Entity[], traits, stores);
    if (live) query!.iterating++;
    try {
      buffers.iterators!.readEach(ctx, dense as Entity[], length, callback, buffers, stores);
    } finally {
      if (live) query!.iterating--;
      releaseIterationBuffers(pool, buffers);
    }
    return this;
  }

  updateEach(callback: Callback, options?: QueryResultOptions) {
    const { dense, length } = this.source;
    if (length === 0) return this;
    const { ctx, query, live } = this;
    const { traits, stores } = this.binding;
    const pool = query ?? ctx;
    const entities = dense as Entity[];
    const buffers = takeIterationBuffers(ctx, pool, entities, traits, stores);
    const iterators = buffers.iterators!;
    if (live) query!.iterating++;
    try {
      if (trackTraits(ctx, query, traits, buffers.modes, options?.changeDetection) === 0) {
        iterators.updateEach(ctx, entities, length, callback, buffers, stores);
      } else {
        const changedCount = iterators.trackEach(ctx, entities, length, callback, buffers, stores);
        const { changedEntities, changedTraits } = buffers;
        for (let i = 0; i < changedCount; i++) {
          const entity = changedEntities[i];
          if (isEntityAlive(ctx.entityIndex, entity)) notifyChanged(ctx, entity, changedTraits[i]);
        }
      }
    } finally {
      if (live) query!.iterating--;
      releaseIterationBuffers(pool, buffers);
    }
    return this;
  }

  getPages() {
    const { query, binding } = this;
    const { dense, length } = this.source;
    let layout: QueryLayout;
    if (!this.live) layout = this.layout ??= createQueryLayout(dense, length);
    else if (query!.isTracking) layout = createQueryLayout(dense, length);
    else layout = getCachedQueryLayout(query!, dense, length);
    return getQueryPages(binding.traits, binding.stores, layout) as QueryPage<any>[];
  }

  /** Views are cached per binding on the query, so selecting every frame allocates nothing. */
  select(...params: QueryParameter[]): QueryResult<any> {
    const binding = getQueryBinding(this.ctx, this.query, params);
    if (binding === this.binding) return this;
    if (this.live) return getLiveView(this.ctx, this.query!, binding);
    return new QueryResultView(this.ctx, this.query, binding, this.source, false);
  }
}

/** Walks the membership present when the loop started and doubles as its own result object. */
class ResultIterator {
  value: Entity = 0 as Entity;
  done = false;
  private index = 0;
  private length = 0;
  private dense: readonly number[] = [];
  private active = false;
  private view: QueryResultView;

  constructor(view: QueryResultView) {
    this.view = view;
  }

  start() {
    const { dense, length } = this.view.source;
    this.dense = dense;
    this.length = length;
    this.index = 0;
    this.done = false;
    this.active = true;
    if (this.view.live) this.view.query!.iterating++;
    return this;
  }

  next(): IteratorResult<Entity> {
    if (this.index < this.length) {
      this.value = this.dense[this.index++] as Entity;
      return this as IteratorResult<Entity>;
    }
    this.finish();
    return this as IteratorResult<Entity>;
  }

  return(): IteratorResult<Entity> {
    this.finish();
    return this as IteratorResult<Entity>;
  }

  [Symbol.iterator]() {
    return this;
  }

  private finish() {
    if (!this.active) return;
    this.active = false;
    this.done = true;
    if (this.view.live) this.view.query!.iterating--;
    this.view.iterator = this;
  }
}

/** Creates the view a query exposes for a binding. Live views follow the exposed set on each run. */
function getLiveView(ctx: WorldContext, query: QueryInstance, binding: QueryResultBinding) {
  let view = binding.view as QueryResultView | null;
  if (view === null) {
    view = new QueryResultView(ctx, query, binding, query.exposed, true);
    binding.view = view;
    query.views.push(view);
  }
  return view;
}

/** Resolves the live view for this run's parameters. */
export function bindQueryResult(
  ctx: WorldContext,
  query: QueryInstance,
  params: QueryParameter[]
): QueryResult<any> {
  return getLiveView(ctx, query, getQueryBinding(ctx, query, params));
}

/** Points every live view of a tracking query at the batch it now exposes. */
export function exposeQuerySet(query: QueryInstance, set: SparseSet) {
  query.exposed = set;
  const views = query.views as QueryResultView[];
  for (let i = 0; i < views.length; i++) views[i].source = set;
}

/** Wraps an entity array the caller owns, such as a lookup result. */
export function createQueryResult<T extends QueryParameter[]>(
  ctx: WorldContext,
  entities: Entity[],
  query: QueryInstance | null,
  params: QueryParameter[]
): QueryResult<T> {
  const binding = getQueryBinding(ctx, query, params);
  return new QueryResultView(ctx, query, binding, new Snapshot(entities), false);
}

/**
 * Finds or builds the trait and store lists for a parameter list. Bindings are cached on the query
 * and never mutated, so results share them and select swaps references. A query ref passes the
 * same parameters array every run, so identity settles the common case before any walk.
 */
function getQueryBinding(
  ctx: WorldContext,
  query: QueryInstance | null,
  params: QueryParameter[]
): QueryResultBinding {
  const cache = query?.resultBindings;
  if (cache) {
    for (let i = 0; i < cache.length; i++) {
      const binding = cache[i];
      if (binding.params === params || matchesQueryBinding(ctx, params, binding)) return binding;
    }
  }
  const binding: QueryResultBinding = { params, traits: [], stores: [], view: null };
  fillQueryBinding(ctx, params, binding);
  if (cache) {
    // Bound so queries that select dynamically do not retain every selection.
    if (cache.length === 4) dropQueryBinding(query!, cache.shift()!);
    cache.push(binding);
  }
  return binding;
}

function dropQueryBinding(query: QueryInstance, binding: QueryResultBinding) {
  if (binding.view === null) return;
  const index = query.views.indexOf(binding.view);
  if (index !== -1) query.views.splice(index, 1);
}

/** Mirrors fillQueryBinding, comparing each stored trait and its current store in order. */
function matchesQueryBinding(
  ctx: WorldContext,
  params: QueryParameter[],
  { traits, stores }: QueryResultBinding
): boolean {
  let index = 0;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isNameConfig(param) || isRelationPair(param)) continue;
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (const trait of param.traits) {
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        if (
          traits[index] !== trait ||
          getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
        )
          return false;
        index++;
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      if (
        traits[index] !== trait ||
        getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
      )
        return false;
      index++;
    }
  }
  return index === traits.length;
}

/** Collects the stored traits of a parameter list in order, registering any that are new. */
function fillQueryBinding(
  ctx: WorldContext,
  params: QueryParameter[],
  { traits, stores }: QueryResultBinding
) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isNameConfig(param) || isRelationPair(param)) continue;
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (const trait of param.traits) {
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        traits.push(trait);
        stores.push(getQueryStore(ctx, trait));
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      traits.push(trait);
      stores.push(getQueryStore(ctx, trait));
    }
  }
}

function createIterationBuffers(): QueryIterationBuffers {
  return {
    state: [],
    traits: [],
    records: [],
    iterators: undefined,
    modes: [],
    atomicSnapshots: [],
    changedEntities: [],
    changedTraits: [],
    next: undefined,
  };
}

/** Checks out buffers from the pool, preparing them when the trait list differs. */
function takeIterationBuffers(
  ctx: WorldContext,
  pool: QueryInstance | WorldContext,
  entities: Entity[],
  traits: Trait[],
  stores: Store<any>[]
): QueryIterationBuffers {
  const buffers = pool.iterationBuffers ?? createIterationBuffers();
  pool.iterationBuffers = buffers.next;
  const prepared = buffers.traits;
  let matches = buffers.iterators !== undefined && prepared.length === traits.length;
  for (let i = 0; matches && i < traits.length; i++) matches = prepared[i] === traits[i];
  if (!matches) prepareIterationBuffers(ctx, buffers, entities, traits, stores);
  return buffers;
}

/** Points the buffers at a new trait list. Records already built for the same trait are kept. */
function prepareIterationBuffers(
  ctx: WorldContext,
  buffers: QueryIterationBuffers,
  entities: Entity[],
  traits: Trait[],
  stores: Store<any>[]
) {
  const { state, records } = buffers;
  const prepared = buffers.traits;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    state[i] = undefined;
    if (prepared[i] === trait) continue;
    prepared[i] = trait;
    records[i] =
      trait[$internal].type === 'soa'
        ? createIterationRecord(ctx, getEntityId(entities[0]), trait, stores[i])
        : undefined;
  }
  state.length = prepared.length = records.length = traits.length;
  buffers.iterators = getQueryIterators(traits);
}

/** Releases references to user objects, then returns the buffers to the pool. */
function releaseIterationBuffers(pool: QueryInstance | WorldContext, buffers: QueryIterationBuffers) {
  buffers.iterators!.release(buffers);
  const snapshots = buffers.atomicSnapshots;
  for (let s = 0; s < snapshots.length; s++) {
    const snapshot = snapshots[s];
    if (snapshot === undefined) continue;
    for (let i = 0; i < snapshot.values.length; i++) {
      const value = snapshot.values[i];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        snapshot.values[i] = undefined;
      }
    }
  }
  buffers.next = pool.iterationBuffers;
  pool.iterationBuffers = buffers;
}

/** Bumps trait versions and fills modes. Returns how many traits are tracked. */
function trackTraits(
  ctx: WorldContext,
  query: QueryInstance | null,
  traits: Trait[],
  modes: number[],
  changeDetection: QueryResultOptions['changeDetection']
) {
  let trackedCount = 0;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    instance.version++;
    // Notifying costs a deferred pass per entity, so skip it when nothing can observe the change.
    const tracked =
      changeDetection === 'always'
        ? hasSubscribers(instance.changeSubscriptions) ||
          ctx.changedMasks.size !== 0 ||
          instance.trackingQueries.size !== 0
        : changeDetection !== 'never' &&
          (hasSubscribers(instance.changeSubscriptions) ||
            (query?.hasChangedModifiers && query.changedTraits.has(trait)));
    if (!tracked) {
      modes[i] = 0;
      continue;
    }
    modes[i] = changeDetection === 'always' ? 3 : trait[$internal].type === 'aos' ? 2 : 1;
    trackedCount++;
  }
  return trackedCount;
}

function createIterationRecord(ctx: WorldContext, entityId: number, trait: Trait, store: Store<any>) {
  const value = trait[$internal].get(ctx, entityId, store);
  let tuples: Record<string, unknown[]> | undefined;
  for (const key in trait.schema) {
    if (Array.isArray(trait.schema[key])) (tuples ??= {})[key] = value[key];
  }
  return { value, tuples };
}

function getQueryStore(ctx: WorldContext, trait: Trait): Store<any> {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance) return instance.store;
  registerTrait(ctx, trait);
  return getTraitInstance(ctx.traitInstances, trait)!.store;
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
