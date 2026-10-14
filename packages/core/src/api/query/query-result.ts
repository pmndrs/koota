import {
  bumpVersion,
  collect,
  getQueryLayout,
  getQueryVersion,
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
import { compileEach, eachLayout, type EachLayout, type EachLoop } from './compile-each';
import { isModifier } from './modifiers';
import type {
  InstancesFromParameters,
  QueryPage,
  QueryParameter,
  QueryResult,
  QueryResultOptions,
} from './types';

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
  if (subscriptions && (subscriptions.change.size > 0 || subscriptions.byEntity.size > 0))
    return true;
  // A destroyed world has no kernel and nothing left to detect.
  return state.kernel?.trackingByType.has(internal.id) === true;
}

type PageCache = { layout: number; traits: Trait[]; pages: QueryPage<any>[] };
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

function buildPages(
  state: WorldState,
  entities: readonly Entity[],
  traits: Trait[]
): QueryPage<any>[] {
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
  parameters: readonly QueryParameter[],
  selected?: Trait[],
  layout = -1,
  version = -1
): QueryResult<T> {
  const traits = selected ?? selectTraits(parameters);
  const kernel = state.kernel!;
  // The order each loops and pages visit. It is the result itself until rows move between
  // matched archetypes, then a private copy kept in row order, so the result never reorders.
  let order: Entity[] = entities;
  // Each loops running on this result. A refresh while one runs would rewrite the order it walks.
  let active = 0;

  /**
   * Returns the matched archetypes when `order` lists their rows in order, or null.
   * When rows moved but no entity entered or left, `order` is rewritten in the current
   * row order, so a static query keeps the archetype walk.
   */
  const archetypeBranches = () => {
    if (layout < 0) return null;
    const now = getQueryLayout(query!);
    if (now !== layout) {
      if (active > 0 || getQueryVersion(kernel, query!) !== version) return null;
      const locals = collect(kernel, query!);
      const localToPublic = state.localToPublic;
      if (order === entities) order = entities.slice();
      for (let i = 0; i < locals.length; i++)
        order[i] = localToPublic[locals[i] & 0x1fffff] as Entity;
      layout = now;
    }
    return query!.branches;
  };

  let eachLoops: EachLayout | undefined;
  // Which traits publish changes in the current updateEach call, reused across calls.
  const detect = traits.map(() => false);
  type Callback = (state: InstancesFromParameters<T>, entity: Entity, index: number) => void;

  // Runs a generated loop, or the generic one when code generation is unavailable.
  // Both visit `order`, refreshed first when rows moved.
  const run = (
    loop: EachLoop | null,
    callback: Callback,
    entity: boolean,
    generic: (callback: Callback) => void
  ) => {
    const branches = archetypeBranches();
    active++;
    try {
      if (loop !== null) loop(state, kernel, order, callback as never, branches);
      else generic(entity ? callback : (values) => (callback as (values: unknown) => void)(values));
    } finally {
      active--;
    }
    return results;
  };

  // Points `columns` and `plans` at the selected traits of one archetype, undefined where absent.
  const viewArchetype = (
    archetypeId: number,
    columns: (Column[] | undefined)[],
    plans: (ColumnPlan | undefined)[]
  ) => {
    const archetype = kernel.archetypes[archetypeId]!;
    for (let t = 0; t < traits.length; t++) {
      const record = archetype.records.get(eachLoops!.ids[t]);
      columns[t] = record?.columns ?? undefined;
      plans[t] = record?.plan ?? undefined;
    }
    return archetypeId;
  };

  const readGeneric = (callback: Callback) => {
    const values: unknown[] = traits.map(() => undefined);
    const columns: (Column[] | undefined)[] = traits.map(() => undefined);
    const plans: (ColumnPlan | undefined)[] = traits.map(() => undefined);
    let viewed = -1;
    for (let i = 0; i < order.length; i++) {
      const local = toLocal(state, order[i]);
      for (let t = 0; t < traits.length; t++) values[t] = undefined;
      if (local !== 0) {
        const index = local & 0x1fffff;
        if (kernel.archetypeOf[index] !== viewed)
          viewed = viewArchetype(kernel.archetypeOf[index], columns, plans);
        const row = kernel.rowOf[index];
        for (let t = 0; t < traits.length; t++) {
          if (columns[t] !== undefined) values[t] = readRecord(columns[t]!, plans[t]!, row);
        }
      }
      callback(values as InstancesFromParameters<T>, order[i], i);
    }
  };

  const updateGeneric = (callback: Callback) => {
    const ids = eachLoops!.ids;
    const flags = detect.slice();
    const values: unknown[] = traits.map(() => undefined);
    const columns: (Column[] | undefined)[] = traits.map(() => undefined);
    const plans: (ColumnPlan | undefined)[] = traits.map(() => undefined);
    const reads: unknown[] = traits.map(() => undefined);
    const copies: Record<string, unknown>[] = traits.map(() => ({}));
    const marked = traits.map(() => false);
    let viewed = -1;
    for (let i = 0; i < order.length; i++) {
      const entity = order[i];
      const local = toLocal(state, entity);
      for (let t = 0; t < traits.length; t++) values[t] = reads[t] = undefined;
      if (local !== 0) {
        const index = local & 0x1fffff;
        if (kernel.archetypeOf[index] !== viewed)
          viewed = viewArchetype(kernel.archetypeOf[index], columns, plans);
        const row = kernel.rowOf[index];
        for (let t = 0; t < traits.length; t++) {
          if (columns[t] === undefined) continue;
          values[t] = reads[t] = readRecord(columns[t]!, plans[t]!, row);
          copies[t] = { ...(reads[t] as object) };
        }
      }
      callback(values as InstancesFromParameters<T>, entity, i);
      if (local === 0 || !isAlive(kernel, local)) continue;
      // The callback may have moved the entity, so the column views follow it.
      const index = local & 0x1fffff;
      if (kernel.archetypeOf[index] !== viewed)
        viewed = viewArchetype(kernel.archetypeOf[index], columns, plans);
      const row = kernel.rowOf[index];
      for (let t = 0; t < traits.length; t++) {
        const traitColumns = columns[t];
        const value = values[t];
        marked[t] = false;
        if (traitColumns === undefined || value === undefined || reads[t] === undefined) continue;
        let changed = false;
        if (plans[t]!.aos) {
          if (value !== reads[t]) {
            traitColumns[0][row] = value;
            changed = true;
          } else if (flags[t] && !shallowEqual(value, copies[t])) {
            changed = true;
          }
        } else {
          // Only fields the callback changed from the value read are stored.
          const fields = plans[t]!.fields;
          for (let f = 0; f < fields.length; f++) {
            const next = (value as Record<string, unknown>)[fields[f]];
            if (next === copies[t][fields[f]]) continue;
            traitColumns[f][row] = next;
            changed = true;
          }
        }
        marked[t] = changed && flags[t];
      }
      // Changes publish after every trait is stored, since an observer may move or destroy the entity.
      for (let t = 0; t < traits.length; t++) if (marked[t]) markChanged(kernel, local, ids[t]);
    }
  };

  const results = Object.assign(entities, {
    readEach(callback: Callback, options?: { entity?: boolean }) {
      const entity = options?.entity ?? true;
      eachLoops ??= eachLayout(traits.map((trait) => trait[$internal].id));
      return run(
        compileEach(eachLoops, false, entity, null, callback, entities.length),
        callback,
        entity,
        readGeneric
      );
    },

    updateEach(callback: Callback, options?: QueryResultOptions) {
      const mode = options?.changeDetection ?? 'auto';
      eachLoops ??= eachLayout(traits.map((trait) => trait[$internal].id));
      for (let t = 0; t < traits.length; t++) {
        detect[t] = mode === 'always' || (mode === 'auto' && hasListeners(state, traits[t]));
      }
      const entity = options?.entity ?? true;
      const loop = compileEach(eachLoops, true, entity, detect, callback, entities.length);
      // Every visited trait may have been written, so its revision advances even without detection.
      if (entities.length > 0)
        for (let t = 0; t < traits.length; t++) bumpVersion(kernel, eachLoops.ids[t]);
      return run(loop, callback, entity, updateGeneric);
    },

    getPages() {
      if (archetypeBranches() !== null) {
        const cache = pageCaches.get(query!);
        if (cache && cache.layout === layout && sameTraits(cache.traits, traits)) return cache.pages;
        const pages = buildPages(state, order, traits);
        pageCaches.set(query!, { layout, traits: traits.slice(), pages });
        return pages as QueryPage<T>[];
      }
      return buildPages(state, order, traits) as QueryPage<T>[];
    },

    select<U extends QueryParameter[]>(...selection: U): QueryResult<U> {
      return createQueryResult<U>(
        state,
        order.slice(),
        query,
        parameters,
        selectTraits(selection),
        layout,
        version
      );
    },

    /** Returns a sorted copy and leaves a cached result untouched. */
    sort(
      callback: (a: Entity, b: Entity) => number = (a, b) => handleIndex(a) - handleIndex(b)
    ): QueryResult<T> {
      const copy = Array.prototype.slice.call(entities) as Entity[];
      copy.sort(callback);
      return createQueryResult<T>(state, copy, query, parameters, traits);
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
export const emptyResult = Object.freeze(
  Object.assign([] as Entity[], emptyMethods)
) as unknown as QueryResult<any>;
