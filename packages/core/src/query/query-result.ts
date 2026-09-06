import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isEntityAlive } from '../entity/utils/entity-index';
import { isRelationPair } from '../relation/utils/is-relation';
import { Store } from '../storage';
import { registerTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import { hasSubscribers } from '../trait/subscriptions';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import { isModifier } from './modifier';
import { setChanged } from './modifiers/changed';
import { getQueryPages } from './query-pages';
import type {
  InstancesFromParameters,
  QueryInstance,
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
      const state = Array.from({ length: traits.length }) as InstancesFromParameters<T>;

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eid = getEntityId(entity);

        createSnapshots(eid, traits, stores, state);

        callback(state, entity, i);
      }

      return results;
    },

    updateEach(
      callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
      options: QueryResultOptions = { changeDetection: 'auto' }
    ) {
      const state = Array.from({ length: traits.length });

      if (options.changeDetection === 'auto') {
        const changedPairs: [Entity, Trait][] = [];
        const atomicSnapshots: any[] = [];
        const trackedIndices: number[] = [];
        const untrackedIndices: number[] = [];

        getTrackedTraits(traits, ctx, query, trackedIndices, untrackedIndices);

        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = getEntityId(entity);

          createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
          callback(state as unknown as InstancesFromParameters<T>, entity, i);

          if (!isEntityAlive(ctx.entityIndex, entity)) continue;

          for (let j = 0; j < trackedIndices.length; j++) {
            const index = trackedIndices[j];
            const trait = traits[index];
            const traitCtx = trait[$internal];
            const newValue = state[index];
            const store = stores[index];

            let changed = false;
            if (traitCtx.type === 'aos') {
              changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
              if (!changed) {
                changed = !shallowEqual(newValue, atomicSnapshots[index]);
              }
            } else {
              changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
            }

            if (changed) changedPairs.push([entity, trait] as const);
          }

          for (let j = 0; j < untrackedIndices.length; j++) {
            const index = untrackedIndices[j];
            const trait = traits[index];
            const traitCtx = trait[$internal];
            const store = stores[index];
            traitCtx.fastSet(eid, store, state[index]);
          }
        }

        for (let i = 0; i < changedPairs.length; i++) {
          const [entity, trait] = changedPairs[i];
          setChanged(ctx, entity, trait);
        }
      } else if (options.changeDetection === 'always') {
        const changedPairs: [Entity, Trait][] = [];
        const atomicSnapshots: any[] = [];

        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = getEntityId(entity);

          createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
          callback(state as unknown as InstancesFromParameters<T>, entity, i);

          if (!isEntityAlive(ctx.entityIndex, entity)) continue;

          for (let j = 0; j < traits.length; j++) {
            const trait = traits[j];
            const traitCtx = trait[$internal];
            const newValue = state[j];

            let changed = false;
            if (traitCtx.type === 'aos') {
              changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
              if (!changed) {
                changed = !shallowEqual(newValue, atomicSnapshots[j]);
              }
            } else {
              changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
            }

            if (changed) changedPairs.push([entity, trait] as const);
          }
        }

        for (let i = 0; i < changedPairs.length; i++) {
          const [entity, trait] = changedPairs[i];
          setChanged(ctx, entity, trait);
        }
      } else if (options.changeDetection === 'never') {
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = getEntityId(entity);
          createSnapshots(eid, traits, stores, state);
          callback(state as unknown as InstancesFromParameters<T>, entity, i);

          if (!isEntityAlive(ctx.entityIndex, entity)) continue;

          for (let j = 0; j < traits.length; j++) {
            const trait = traits[j];
            const traitCtx = trait[$internal];
            traitCtx.fastSet(eid, stores[j], state[j]);
          }
        }
      }

      return results;
    },

    getPages() {
      layout ??=
        usesCustomOrder || query.isTracking || query.version !== version
          ? createQueryLayout(entities)
          : getCachedQueryLayout(query, entities);
      return getQueryPages(stores, layout) as QueryPage<T>[];
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

/* @inline */ function getTrackedTraits(
  traits: Trait[],
  ctx: WorldContext,
  query: QueryInstance,
  trackedIndices: number[],
  untrackedIndices: number[]
) {
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait);
    const hasTracked = instance !== undefined && hasSubscribers(instance.changeSubscriptions);
    const hasChanged = query.hasChangedModifiers && query.changedTraits.has(trait);

    if (hasTracked || hasChanged) trackedIndices.push(i);
    else untrackedIndices.push(i);
  }
}

/* @inline */ function createSnapshots(
  entityId: number,
  traits: Trait[],
  stores: Store<any>[],
  state: any[]
) {
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const ctx = trait[$internal];
    const value = ctx.get(entityId, stores[i]);
    state[i] = value;
  }
}

/* @inline */ function createSnapshotsWithAtomic(
  entityId: number,
  traits: Trait[],
  stores: Store<any>[],
  state: any[],
  atomicSnapshots: any[]
) {
  for (let j = 0; j < traits.length; j++) {
    const trait = traits[j];
    const ctx = trait[$internal];
    const value = ctx.get(entityId, stores[j]);
    state[j] = value;
    atomicSnapshots[j] = ctx.type === 'aos' ? { ...value } : null;
  }
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
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  updateEach(this: QueryResult<any>, callback: any) {
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  getPages(this: QueryResult<any>) {
    return getQueryPages([], getRelationOnlyLayout(this));
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
