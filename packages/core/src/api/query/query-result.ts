import {
  bumpVersion,
  getQueryVersion as getKernelQueryVersion,
  isAlive,
  markChanged,
  readRecord,
  type Archetype,
  type Column,
  type ColumnPlan,
  type Query as KernelQuery,
} from '../../kernel';
import type { Entity } from '../entity/types';
import { handleIndex, toLocal } from '../handles';
import { isRelationPair } from '../relation/relation';
import { $internal } from '../symbols';
import type { Trait } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import type { WorldState } from '../world/state';
import { isModifier } from './modifiers';
import type { InstancesFromParameters, QueryPage, QueryParameter, QueryResult, QueryResultOptions } from './types';

/** Data-bearing traits a parameter list selects, in caller order. */
function selectTraits(parameters: readonly QueryParameter[]): Trait[] {
  const traits: Trait[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (isRelationPair(parameter)) continue;
    if (isModifier(parameter)) {
      if (parameter.type === 'not') continue;
      for (const item of parameter.traits) {
        const internal = item[$internal];
        if (internal.type === 'tag' || internal.relation) continue;
        traits.push(item);
      }
      continue;
    }
    const internal = parameter[$internal];
    if (internal.type === 'tag' || internal.relation) continue;
    traits.push(parameter);
  }
  return traits;
}

function hasListeners(state: WorldState, trait: Trait): boolean {
  const internal = trait[$internal];
  if (internal.hooks?.onSet) return true;
  const subscriptions = state.traitSubscriptions.get(internal.id);
  if (subscriptions && (subscriptions.change.size > 0 || subscriptions.byEntity.size > 0)) return true;
  return state.kernel!.trackingByType.has(internal.id);
}

type PageCache = { version: number; traits: Trait[]; pages: QueryPage<any>[] };
const pageCaches = new WeakMap<KernelQuery, PageCache>();

function pageStore(archetype: Archetype, trait: Trait): unknown {
  const internal = trait[$internal];
  const record = archetype.records.get(internal.id)!;
  const columns = record.columns!;
  if (internal.type === 'aos') return columns[0];
  const plan = record.plan!;
  const store: Record<string, Column> = {};
  for (let i = 0; i < plan.fields.length; i++) store[plan.fields[i]] = columns[i];
  return store;
}

function buildPages(state: WorldState, entities: readonly Entity[], traits: Trait[]): QueryPage<any>[] {
  const kernel = state.kernel!;
  const pages: QueryPage<any>[] = [];
  const byArchetype = new Map<number, { rows: number[]; entities: Entity[] }>();
  for (let i = 0; i < entities.length; i++) {
    const local = toLocal(state, entities[i]);
    if (local === 0) continue;
    const index = local & 0x1fffff;
    const archetypeId = kernel.archetypeOf[index];
    let page = byArchetype.get(archetypeId);
    if (!page) byArchetype.set(archetypeId, (page = { rows: [], entities: [] }));
    page.rows.push(kernel.rowOf[index]);
    page.entities.push(entities[i]);
  }
  for (const [archetypeId, page] of byArchetype) {
    const archetype = kernel.archetypes[archetypeId]!;
    if (traits.some((trait) => archetype.records.get(trait[$internal].id)?.columns == null)) continue;
    pages.push({
      index: pages.length,
      stores: traits.map((trait) => pageStore(archetype, trait)) as QueryPage<any>['stores'],
      indices: Uint32Array.from(page.rows),
      entities: page.entities,
    });
  }
  return pages;
}

export function createQueryResult<T extends QueryParameter[]>(
  state: WorldState,
  entities: Entity[],
  query: KernelQuery | null,
  parameters: readonly QueryParameter[]
): QueryResult<T> {
  let traits = selectTraits(parameters);
  let customOrder = false;
  const kernel = state.kernel!;

  const results = Object.assign(entities, {
    readEach(callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void) {
      const values: unknown[] = Array.from({ length: traits.length });
      const columns: (Column[] | undefined)[] = Array.from({ length: traits.length });
      const plans: (ColumnPlan | undefined)[] = Array.from({ length: traits.length });
      let cachedArchetype = -1;
      for (let i = 0; i < entities.length; i++) {
        const local = toLocal(state, entities[i]);
        if (local === 0) {
          for (let t = 0; t < traits.length; t++) values[t] = undefined;
          callback(values as InstancesFromParameters<T>, entities[i], i);
          continue;
        }
        const index = local & 0x1fffff;
        const archetypeId = kernel.archetypeOf[index];
        if (archetypeId !== cachedArchetype) {
          cachedArchetype = archetypeId;
          const archetype = kernel.archetypes[archetypeId]!;
          for (let t = 0; t < traits.length; t++) {
            const id = traits[t][$internal].id;
            const record = archetype.records.get(id);
            columns[t] = record?.columns ?? undefined;
            plans[t] = record?.plan ?? undefined;
          }
        }
        const row = kernel.rowOf[index];
        for (let t = 0; t < traits.length; t++) {
          const traitColumns = columns[t];
          values[t] = traitColumns === undefined ? undefined : readRecord(traitColumns, plans[t]!, row);
        }
        callback(values as InstancesFromParameters<T>, entities[i], i);
      }
      return results;
    },

    updateEach(
      callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
      options: QueryResultOptions = { changeDetection: 'auto' }
    ) {
      const mode = options.changeDetection ?? 'auto';
      const detect: boolean[] = traits.map((trait) => mode === 'always' || (mode === 'auto' && hasListeners(state, trait)));
      const values: unknown[] = Array.from({ length: traits.length });
      const copies: unknown[] = Array.from({ length: traits.length });
      const columns: (Column[] | undefined)[] = Array.from({ length: traits.length });
      const plans: (ColumnPlan | undefined)[] = Array.from({ length: traits.length });
      const aos: boolean[] = traits.map((trait) => trait[$internal].type === 'aos');
      const ids: number[] = traits.map((trait) => trait[$internal].id);
      let cachedArchetype = -1;
      const cacheArchetype = (archetypeId: number) => {
        cachedArchetype = archetypeId;
        const archetype = kernel.archetypes[archetypeId]!;
        for (let t = 0; t < traits.length; t++) {
          const record = archetype.records.get(ids[t]);
          columns[t] = record?.columns ?? undefined;
          plans[t] = record?.plan ?? undefined;
        }
      };
      // Every visited trait may have been written, so its revision advances even without detection.
      if (entities.length > 0) for (let t = 0; t < traits.length; t++) bumpVersion(kernel, ids[t]);
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const local = toLocal(state, entity);
        if (local === 0) {
          for (let t = 0; t < traits.length; t++) values[t] = undefined;
          callback(values as InstancesFromParameters<T>, entity, i);
          continue;
        }
        const index = local & 0x1fffff;
        if (kernel.archetypeOf[index] !== cachedArchetype) cacheArchetype(kernel.archetypeOf[index]);
        const row = kernel.rowOf[index];
        for (let t = 0; t < traits.length; t++) {
          const traitColumns = columns[t];
          if (traitColumns === undefined) {
            values[t] = undefined;
            copies[t] = undefined;
            continue;
          }
          const value = readRecord(traitColumns, plans[t]!, row);
          values[t] = value;
          copies[t] = aos[t] && detect[t] ? { ...(value as object) } : undefined;
        }
        callback(values as InstancesFromParameters<T>, entity, i);
        if (!isAlive(kernel, local)) continue;
        // The callback may have moved the entity, so refresh the column views when it did.
        if (kernel.archetypeOf[index] !== cachedArchetype) cacheArchetype(kernel.archetypeOf[index]);
        const currentRow = kernel.rowOf[index];
        for (let t = 0; t < traits.length; t++) {
          const traitColumns = columns[t];
          if (traitColumns === undefined || values[t] === undefined) continue;
          let changed = false;
          if (aos[t]) {
            const stored = traitColumns[0][currentRow];
            if (stored !== values[t]) {
              traitColumns[0][currentRow] = values[t];
              changed = true;
            } else if (detect[t] && !shallowEqual(values[t], copies[t])) {
              changed = true;
            }
          } else {
            const fields = plans[t]!.fields;
            const record = values[t] as Record<string, unknown>;
            for (let f = 0; f < fields.length; f++) {
              const next = record[fields[f]];
              if (traitColumns[f][currentRow] !== next) {
                traitColumns[f][currentRow] = next;
                changed = true;
              }
            }
          }
          if (!changed) continue;
          if (detect[t]) markChanged(kernel, local, ids[t]);
          else bumpVersion(kernel, ids[t]);
        }
      }
      return results;
    },

    getPages() {
      if (query !== null && !customOrder && !query.dynamic) {
        const version = getKernelQueryVersion(kernel, query);
        const cache = pageCaches.get(query);
        if (cache && cache.version === version && sameTraits(cache.traits, traits)) return cache.pages;
        const pages = buildPages(state, entities, traits);
        pageCaches.set(query, { version, traits: traits.slice(), pages });
        return pages as QueryPage<T>[];
      }
      return buildPages(state, entities, traits) as QueryPage<T>[];
    },

    select<U extends QueryParameter[]>(...selection: U): QueryResult<U> {
      traits = selectTraits(selection);
      return results as unknown as QueryResult<U>;
    },

    sort(callback: (a: Entity, b: Entity) => number = (a, b) => handleIndex(a) - handleIndex(b)): QueryResult<T> {
      customOrder = true;
      Array.prototype.sort.call(entities, callback);
      return results;
    },
  });

  return results as unknown as QueryResult<T>;
}

function sameTraits(a: Trait[], b: Trait[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const emptyMethods = {
  readEach() {
    return emptyResult;
  },
  updateEach() {
    return emptyResult;
  },
  getPages() {
    return [];
  },
  select() {
    return emptyResult;
  },
  sort() {
    return emptyResult;
  },
};

/** Shared empty result, so callers can compare empty snapshots by reference. */
export const emptyResult = Object.freeze(Object.assign([] as Entity[], emptyMethods)) as unknown as QueryResult<any>;
