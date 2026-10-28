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
      const buffers = query.iterationBuffers ?? createIterationBuffers();
      query.iterationBuffers = buffers.next;

      try {
        prepareIterationBuffers(ctx, getEntityId(entities[0]), traits, stores, buffers);
        const { state, readers, values, tuples, tupleCount } = buffers;
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          createSnapshots(
            ctx,
            getEntityId(entity),
            stores,
            state,
            readers,
            values,
            tuples,
            tupleCount
          );
          callback(state as InstancesFromParameters<T>, entity, i);
        }
      } finally {
        clearIterationBuffers(buffers);
        buffers.next = query.iterationBuffers;
        query.iterationBuffers = buffers;
      }

      return results;
    },

    updateEach(
      callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
      options?: QueryResultOptions
    ) {
      if (entities.length === 0) return results;
      const buffers = query.iterationBuffers ?? createIterationBuffers();
      query.iterationBuffers = buffers.next;

      // Invalidate once per trait even when auto or never skips change detection.
      try {
        prepareIterationBuffers(ctx, getEntityId(entities[0]), traits, stores, buffers);
        const {
          state,
          readers,
          values,
          tuples,
          tupleCount,
          trackedIndices,
          untrackedIndices,
          atomicSnapshots,
          changedEntities,
          changedTraits,
        } = buffers;
        for (let i = 0; i < traits.length; i++) {
          getTraitInstance(ctx.traitInstances, traits[i])!.version++;
        }

        const trackedCount = getTrackedTraits(
          traits,
          ctx,
          query,
          trackedIndices,
          untrackedIndices,
          options?.changeDetection ?? 'auto'
        );
        const untrackedCount = traits.length - trackedCount;
        let changedCount = 0;

        if (trackedCount === 0) {
          for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const eid = getEntityId(entity);
            createSnapshots(ctx, eid, stores, state, readers, values, tuples, tupleCount);
            callback(state as InstancesFromParameters<T>, entity, i);
            if (!isEntityAlive(ctx.entityIndex, entity)) continue;
            for (let j = 0; j < traits.length; j++) {
              traits[j][$internal].set(ctx, eid, stores[j], state[j]);
            }
          }
          return results;
        }

        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = getEntityId(entity);

          createSnapshots(ctx, eid, stores, state, readers, values, tuples, tupleCount);
          createAtomicSnapshots(traits, state, atomicSnapshots, trackedIndices, trackedCount);
          callback(state as InstancesFromParameters<T>, entity, i);

          if (!isEntityAlive(ctx.entityIndex, entity)) continue;

          for (let j = 0; j < trackedCount; j++) {
            const index = trackedIndices[j];
            const trait = traits[index];
            const traitCtx = trait[$internal];
            const newValue = state[index];
            const store = stores[index];

            let changed = traitCtx.set(ctx, eid, store, newValue);
            // An atomic value mutated in place is the same reference, so compare its snapshot.
            if (!changed && traitCtx.type === 'aos') {
              changed = atomicChanged(newValue, atomicSnapshots[index]);
            }

            if (changed) {
              changedEntities[changedCount] = entity;
              changedTraits[changedCount++] = trait;
            }
          }

          for (let j = 0; j < untrackedCount; j++) {
            const index = untrackedIndices[j];
            const trait = traits[index];
            const traitCtx = trait[$internal];
            const store = stores[index];
            traitCtx.set(ctx, eid, store, state[index]);
          }
        }

        for (let i = 0; i < changedCount; i++) {
          const entity = changedEntities[i];
          if (!isEntityAlive(ctx.entityIndex, entity)) continue;
          notifyChanged(ctx, entity, changedTraits[i]);
        }
      } finally {
        clearIterationBuffers(buffers);
        buffers.next = query.iterationBuffers;
        query.iterationBuffers = buffers;
      }

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
    readers: [],
    values: [],
    tuples: [],
    tupleCount: 0,
    records: [],
    atomicSnapshots: [],
    trackedIndices: [],
    untrackedIndices: [],
    changedEntities: [],
    changedTraits: [],
  };
}

/** Release references to user objects while keeping numeric scratch and buffer capacity. */
function clearIterationBuffers(buffers: QueryIterationBuffers) {
  buffers.state.fill(undefined);
  for (const record of buffers.records) {
    if (!record) continue;
    for (const key in record.value) {
      const value = record.value[key];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        if (record.tuples?.[key] !== value) record.value[key] = undefined;
      }
    }
  }
  for (const snapshot of buffers.atomicSnapshots) {
    if (!snapshot) continue;
    for (let i = 0; i < snapshot.values.length; i++) {
      const value = snapshot.values[i];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        snapshot.values[i] = undefined;
      }
    }
  }
}

/* @inline */ function getTrackedTraits(
  traits: Trait[],
  ctx: WorldContext,
  query: QueryInstance,
  trackedIndices: number[],
  untrackedIndices: number[],
  changeDetection: NonNullable<QueryResultOptions['changeDetection']>
) {
  let trackedCount = 0;
  let untrackedCount = 0;
  for (let i = 0; i < traits.length; i++) {
    if (changeDetection === 'always') {
      trackedIndices[trackedCount++] = i;
      continue;
    }
    if (changeDetection === 'never') {
      untrackedIndices[untrackedCount++] = i;
      continue;
    }
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait);
    const hasTracked = instance !== undefined && hasSubscribers(instance.changeSubscriptions);
    const hasChanged = query.hasChangedModifiers && query.changedTraits.has(trait);

    if (hasTracked || hasChanged) trackedIndices[trackedCount++] = i;
    else untrackedIndices[untrackedCount++] = i;
  }
  return trackedCount;
}

function prepareIterationBuffers(
  ctx: WorldContext,
  entityId: number,
  traits: Trait[],
  stores: Store<any>[],
  buffers: QueryIterationBuffers
) {
  buffers.state.length = traits.length;
  buffers.tupleCount = 0;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const traitCtx = trait[$internal];
    if (traitCtx.type !== 'soa') {
      buffers.readers[i] = traitCtx.get;
      buffers.values[i] = undefined;
      continue;
    }

    let record = buffers.records[i];
    if (!record || record.trait !== trait) {
      record = buffers.records[i] = createIterationRecord(ctx, entityId, trait, stores[i]);
    }
    buffers.readers[i] = traitCtx.getInto;
    buffers.values[i] = record.value;
    if (record.tuples) {
      for (const key in record.tuples) {
        const index = buffers.tupleCount++;
        const tuple = buffers.tuples[index];
        if (tuple) {
          tuple.record = record.value;
          tuple.key = key;
          tuple.value = record.tuples[key];
        } else {
          buffers.tuples[index] = { record: record.value, key, value: record.tuples[key] };
        }
      }
    }
  }
}

/* @inline */ function createSnapshots(
  ctx: WorldContext,
  entityId: number,
  stores: Store<any>[],
  state: any[],
  readers: QueryIterationBuffers['readers'],
  values: any[],
  tuples: QueryIterationBuffers['tuples'],
  tupleCount: number
) {
  // Restore owned tuple arrays if the previous callback replaced a field.
  for (let i = 0; i < tupleCount; i++) {
    const tuple = tuples[i];
    tuple.record[tuple.key] = tuple.value;
  }
  for (let i = 0; i < stores.length; i++) {
    state[i] = readers[i](ctx, entityId, stores[i], values[i]);
  }
}

function createIterationRecord(ctx: WorldContext, entityId: number, trait: Trait, store: Store<any>) {
  const value = trait[$internal].get(ctx, entityId, store);
  let tuples: Record<string, unknown[]> | undefined;
  for (const key in trait.schema) {
    if (Array.isArray(trait.schema[key])) (tuples ??= {})[key] = value[key];
  }
  return { trait, value, tuples };
}

/* @inline */ function createAtomicSnapshots(
  traits: Trait[],
  state: any[],
  snapshots: QueryIterationBuffers['atomicSnapshots'],
  trackedIndices: number[],
  trackedCount: number
) {
  for (let j = 0; j < trackedCount; j++) {
    const index = trackedIndices[j];
    if (traits[index][$internal].type !== 'aos') continue;
    const value = state[index];
    const snapshot = (snapshots[index] ??= { keys: [], values: [], count: 0 });
    let count = 0;
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      snapshot.keys[count] = key;
      snapshot.values[count++] = value[key];
    }
    snapshot.count = count;
  }
}

function atomicChanged(value: any, snapshot: QueryIterationBuffers['atomicSnapshots'][number]) {
  if (typeof value !== 'object' || value === null) return true;
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    let index = count++;
    if (snapshot.keys[index] !== key) {
      index = snapshot.keys.indexOf(key);
      if (index === -1 || index >= snapshot.count) return true;
    }
    if (value[key] !== snapshot.values[index]) return true;
  }
  return count !== snapshot.count;
}

/* @inline */ export function getQueryStores<T extends QueryParameter[]>(
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
