import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isEntityAlive } from '../entity/utils/entity-index';
import { isRelationPair } from '../relation/utils/is-relation';
import { Store } from '../storage';
import { registerTrait } from '../trait/trait';
import type { Trait, TraitInstance } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import { hasSubscribers } from '../trait/subscriptions';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import { isModifier } from './modifier';
import { setChangedForInstance } from './modifiers/changed';
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

type TraitContext = Trait[typeof $internal];

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
      const traitCtxs = traits.map((trait) => trait[$internal]);

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eid = getEntityId(entity);

        createSnapshots(eid, traitCtxs, stores, state);

        callback(state, entity, i);
      }

      return results;
    },

    updateEach(
      callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
      options: QueryResultOptions = { changeDetection: 'auto' }
    ) {
      const state = Array.from({ length: traits.length }) as InstancesFromParameters<T>;
      const traitCtxs = traits.map((trait) => trait[$internal]);
      const mode = options.changeDetection;

      // Traits that emit change events and the instances that receive them.
      const trackedIndices: number[] = [];
      const untrackedIndices: number[] = [];
      const trackedInstances: TraitInstance[] = [];
      for (let i = 0; mode !== 'never' && i < traits.length; i++) {
        const instance = getTraitInstance(ctx.traitInstances, traits[i])!;
        const isTracked =
          mode === 'always' ||
          instance.changedQueries.length !== 0 ||
          hasSubscribers(instance.changeSubscriptions);

        if (isTracked) {
          trackedIndices.push(i);
          trackedInstances.push(instance);
        } else {
          untrackedIndices.push(i);
        }
      }

      if (trackedIndices.length === 0) {
        updateUntracked(ctx, entities, traitCtxs, stores, state, callback);
        return results;
      }

      // Atomic traits are compared against a copy since the callback mutates the stored object.
      const atomicIndices: number[] = [];
      for (let i = 0; i < trackedIndices.length; i++) {
        if (traitCtxs[trackedIndices[i]].type === 'aos') atomicIndices.push(trackedIndices[i]);
      }

      // Changes are recorded as parallel arrays and flushed after the loop so
      // subscribers observe every store write from this pass.
      const changedEntities: Entity[] = [];
      const changedSlots: number[] = [];
      const atomicSnapshots: any[] = [];

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eid = getEntityId(entity);

        createSnapshots(eid, traitCtxs, stores, state);
        for (let j = 0; j < atomicIndices.length; j++) {
          const index = atomicIndices[j];
          atomicSnapshots[index] = { ...state[index] };
        }

        callback(state, entity, i);

        if (!isEntityAlive(ctx.entityIndex, entity)) continue;

        for (let j = 0; j < trackedIndices.length; j++) {
          const index = trackedIndices[j];
          const traitCtx = traitCtxs[index];
          const newValue = state[index];

          let changed = traitCtx.fastSetWithChangeDetection(eid, stores[index], newValue);
          if (!changed && traitCtx.type === 'aos') {
            changed = !shallowEqual(newValue, atomicSnapshots[index]);
          }

          if (changed) {
            changedEntities.push(entity);
            changedSlots.push(j);
          }
        }

        for (let j = 0; j < untrackedIndices.length; j++) {
          const index = untrackedIndices[j];
          traitCtxs[index].fastSet(eid, stores[index], state[index]);
        }
      }

      for (let i = 0; i < changedEntities.length; i++) {
        setChangedForInstance(ctx, changedEntities[i], trackedInstances[changedSlots[i]]);
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

// Keep unobserved writeback separate so it can optimize independently of change detection.
function updateUntracked<T extends unknown[]>(
  ctx: WorldContext,
  entities: Entity[],
  traitCtxs: TraitContext[],
  stores: Store<any>[],
  state: T,
  callback: (state: T, entity: Entity, index: number) => void
) {
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const eid = getEntityId(entity);

    createSnapshots(eid, traitCtxs, stores, state);
    callback(state, entity, i);

    if (!isEntityAlive(ctx.entityIndex, entity)) continue;

    for (let j = 0; j < traitCtxs.length; j++) {
      traitCtxs[j].fastSet(eid, stores[j], state[j]);
    }
  }
}

/* @inline */ function createSnapshots(
  entityId: number,
  traitCtxs: TraitContext[],
  stores: Store<any>[],
  state: any[]
) {
  for (let i = 0; i < traitCtxs.length; i++) {
    state[i] = traitCtxs[i].get(entityId, stores[i]);
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
