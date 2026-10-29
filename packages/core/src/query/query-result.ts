import { $internal } from '../common';
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
  InstancesFromParameters,
  QueryInstance,
  QueryIterationBuffers,
  QueryLayout,
  QueryLayoutCache,
  QueryParameter,
  QueryPage,
  QueryResult,
  QueryResultOptions,
} from './types';

export function createQueryResult<T extends QueryParameter[]>(
  ctx: WorldContext,
  entities: Entity[],
  query: QueryInstance,
  params: QueryParameter[]
): QueryResult<T> {
  const traits: Trait[] = [];
  const stores: Store<any>[] = [];

  getQueryStores(params, traits, stores, ctx);
  let usesCustomOrder = false;
  const version = query.version;
  let layout: QueryLayout | undefined;

  const results = Object.assign(entities, {
    readEach(callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void) {
      if (entities.length === 0) return results;
      const buffers = takeIterationBuffers(ctx, query, entities, traits, stores);
      buffers.iterators!.readEach(ctx, entities, callback, buffers, stores);
      releaseIterationBuffers(query, buffers);
      return results;
    },

    updateEach(
      callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
      options?: QueryResultOptions
    ) {
      if (entities.length === 0) return results;
      const buffers = takeIterationBuffers(ctx, query, entities, traits, stores);
      const iterators = buffers.iterators!;

      if (trackTraits(ctx, query, traits, buffers.modes, options?.changeDetection) === 0) {
        iterators.updateEach(ctx, entities, callback, buffers, stores);
      } else {
        const changedCount = iterators.trackEach(ctx, entities, callback, buffers, stores);
        const { changedEntities, changedTraits } = buffers;
        for (let i = 0; i < changedCount; i++) {
          const entity = changedEntities[i];
          if (isEntityAlive(ctx.entityIndex, entity)) notifyChanged(ctx, entity, changedTraits[i]);
        }
      }

      releaseIterationBuffers(query, buffers);
      return results;
    },

    getPages() {
      layout ??=
        usesCustomOrder || query.isTracking || query.version !== version
          ? createQueryLayout(entities)
          : getCachedQueryLayout(query, entities);
      return getQueryPages(traits, stores, layout) as QueryPage<T>[];
    },

    select<U extends QueryParameter[]>(...params: U): QueryResult<U> {
      traits.length = 0;
      stores.length = 0;
      getQueryStores(params, traits, stores, ctx);
      return results as unknown as QueryResult<U>;
    },

    sort(
      callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)
    ): QueryResult<T> {
      usesCustomOrder = true;
      layout = undefined;
      Array.prototype.sort.call(entities, callback);
      return results;
    },
  });

  return results;
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

/**
 * Checks out buffers from the query's pool. A callback that throws never returns its buffers, so
 * the pool simply allocates new ones next time.
 */
function takeIterationBuffers(
  ctx: WorldContext,
  query: QueryInstance,
  entities: Entity[],
  traits: Trait[],
  stores: Store<any>[]
): QueryIterationBuffers {
  const buffers = query.iterationBuffers ?? createIterationBuffers();
  query.iterationBuffers = buffers.next;
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
function releaseIterationBuffers(query: QueryInstance, buffers: QueryIterationBuffers) {
  buffers.iterators!.release(buffers);
  for (const snapshot of buffers.atomicSnapshots) {
    if (snapshot === undefined) continue;
    for (let i = 0; i < snapshot.values.length; i++) {
      const value = snapshot.values[i];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        snapshot.values[i] = undefined;
      }
    }
  }
  buffers.next = query.iterationBuffers;
  query.iterationBuffers = buffers;
}

/** Bumps trait versions and fills modes. Returns how many traits are tracked. */
function trackTraits(
  ctx: WorldContext,
  query: QueryInstance,
  traits: Trait[],
  modes: number[],
  changeDetection: QueryResultOptions['changeDetection']
) {
  let trackedCount = 0;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    instance.version++;
    const tracked =
      changeDetection === 'always' ||
      (changeDetection !== 'never' &&
        (hasSubscribers(instance.changeSubscriptions) ||
          (query.hasChangedModifiers && query.changedTraits.has(trait))));
    modes[i] = tracked ? (trait[$internal].type === 'aos' ? 2 : 1) : 0;
    if (tracked) trackedCount++;
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

export function getQueryStores<T extends QueryParameter[]>(
  params: T,
  traits: Trait[],
  stores: Store<any>[],
  ctx: WorldContext
) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];

    if (isRelationPair(param)) continue;

    if (isModifier(param)) {
      if (param.type === 'not') continue;

      const modifierTraits = param.traits;
      for (const trait of modifierTraits) {
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

function getCachedQueryLayout(query: QueryInstance, entities: readonly Entity[]): QueryLayout {
  const cache = query.layoutCache;
  if (cache && cache.version === query.version) return cache;

  const next = createQueryLayout(entities, query.version);
  query.layoutCache = next;
  return next;
}

function createQueryLayout(
  entities: readonly Entity[],
  version = EMPTY_LAYOUT_CACHE.version
): QueryLayoutCache {
  if (entities.length === 0) return EMPTY_LAYOUT_CACHE;

  const pagesById = new Map<number, QueryPageBuilder>();

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
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

export function createEmptyQueryResult(): QueryResult<QueryParameter[]> {
  const results = Object.assign([], {
    readEach: () => results,
    updateEach: () => results,
    getPages: () => [],
    select: () => results,
    sort: () => results,
  }) as QueryResult<QueryParameter[]>;

  return results;
}

const relationOnlyLayouts = new WeakMap<QueryResult<any>, QueryLayout>();

function getRelationOnlyLayout(results: QueryResult<any>) {
  let layout = relationOnlyLayouts.get(results);
  if (!layout) {
    layout = createQueryLayout(results);
    relationOnlyLayouts.set(results, layout);
  }
  return layout;
}

// Shared methods for relation-only query snapshots.
const relationOnlyMethods = {
  readEach(this: QueryResult<any>, callback: any) {
    const state: [] = [];
    for (let i = 0; i < this.length; i++) {
      callback(state, this[i], i);
    }
    return this;
  },
  updateEach(this: QueryResult<any>, callback: any) {
    const state: [] = [];
    for (let i = 0; i < this.length; i++) {
      callback(state, this[i], i);
    }
    return this;
  },
  getPages(this: QueryResult<any>) {
    return getQueryPages([], [], getRelationOnlyLayout(this));
  },
  select(this: QueryResult<any>) {
    return this;
  },
  sort(
    this: QueryResult<any>,
    callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)
  ) {
    Array.prototype.sort.call(this, callback);
    relationOnlyLayouts.delete(this);
    return this;
  },
};

export function createRelationOnlyQueryResult<T extends QueryParameter[]>(
  entities: Entity[]
): QueryResult<T> {
  if (entities.length === 0) return cachedEmptyRelationResult as unknown as QueryResult<T>;
  return Object.assign(entities, relationOnlyMethods) as unknown as QueryResult<T>;
}

const cachedEmptyRelationResult = Object.assign([], relationOnlyMethods) as QueryResult<any>;
