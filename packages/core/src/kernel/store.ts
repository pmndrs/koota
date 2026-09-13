import { INDEX_MASK, isPair, pairTargetIndex, type Entity, type TypeId } from './id';
import { markUsed, relationDefinition, typePlan } from './registry';
import type { ColumnPlan } from './schema';
import type { World } from './world';

/**
 * Storage outside archetypes. A concrete pair and a sparse trait each own
 * one store per world, keyed by their type id: a dense list of the entities
 * that hold it, parallel stamps, and data columns. Inserting or erasing a row
 * never moves the entity. Each entity lists its external types as
 * `[type, row, type, row, ...]` in `world.externals`.
 */
export type Store = {
  readonly type: TypeId;
  readonly plan: ColumnPlan | null;
  readonly sources: Entity[];
  /** Holders in insertion order, for pairs of an ordered relation. `sources` stays swap-removed for rows. */
  readonly order: Entity[] | null;
  readonly columns: unknown[][] | null;
  readonly added: number[];
  readonly changed: number[];
  maxAdded: number;
  maxChanged: number;
};

function ensureStore(world: World, type: TypeId): Store {
  let store = world.stores.get(type);
  if (store) return store;
  markUsed(type);
  const plan = typePlan(type);
  store = {
    type,
    plan,
    sources: [],
    order: isPair(type) && relationDefinition(type).ordered ? [] : null,
    columns: plan ? plan.fields.map(() => []) : null,
    added: [],
    changed: [],
    maxAdded: 0,
    maxChanged: 0,
  };
  world.stores.set(type, store);
  if (isPair(type)) {
    const targetIndex = pairTargetIndex(type);
    let byTarget = world.pairsByTarget.get(targetIndex);
    if (!byTarget) world.pairsByTarget.set(targetIndex, (byTarget = []));
    byTarget.push(store);
  }
  return store;
}

/** Drops an emptied store. Pair stores also leave their target's cleanup index. */
export function deleteStore(world: World, store: Store): void {
  world.stores.delete(store.type);
  if (!isPair(store.type)) return;
  const targetIndex = pairTargetIndex(store.type);
  const byTarget = world.pairsByTarget.get(targetIndex);
  if (!byTarget) return;
  const position = byTarget.indexOf(store);
  if (position >= 0) byTarget.splice(position, 1);
  if (byTarget.length === 0) world.pairsByTarget.delete(targetIndex);
}

/** Row of the entity in the type's store, or -1 when the entity lacks it. */
export function storeRow(world: World, index: number, type: TypeId): number {
  const list = world.externals[index];
  if (list === undefined) return -1;
  for (let i = 0; i < list.length; i += 2) if (list[i] === type) return list[i + 1];
  return -1;
}

export function insertRow(world: World, entity: Entity, type: TypeId, revision: number): number {
  const store = ensureStore(world, type);
  const row = store.sources.length;
  store.sources.push(entity);
  if (store.order !== null) store.order.push(entity);
  store.added.push(revision);
  store.changed.push(0);
  if (revision > store.maxAdded) store.maxAdded = revision;
  const columns = store.columns;
  if (columns) {
    const numeric = store.plan!.numeric;
    for (let i = 0; i < columns.length; i++) columns[i].push(numeric[i] ? 0 : undefined);
  }
  const index = entity & INDEX_MASK;
  const list = world.externals[index];
  if (list === undefined) world.externals[index] = [type, row];
  else list.push(type, row);
  return row;
}

export function eraseRow(world: World, entity: Entity, type: TypeId): boolean {
  const index = entity & INDEX_MASK;
  const list = world.externals[index];
  if (list === undefined) return false;
  let position = -1;
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] === type) {
      position = i;
      break;
    }
  }
  if (position < 0) return false;
  const row = list[position + 1];
  const end = list.length - 2;
  if (position !== end) {
    list[position] = list[end];
    list[position + 1] = list[end + 1];
  }
  list.length = end;
  const store = world.stores.get(type)!;
  const last = store.sources.length - 1;
  if (row !== last) {
    const moved = store.sources[last];
    store.sources[row] = moved;
    store.added[row] = store.added[last];
    store.changed[row] = store.changed[last];
    const columns = store.columns;
    if (columns) for (let i = 0; i < columns.length; i++) columns[i][row] = columns[i][last];
    const movedList = world.externals[moved & INDEX_MASK]!;
    for (let i = 0; i < movedList.length; i += 2) {
      if (movedList[i] === type) {
        movedList[i + 1] = row;
        break;
      }
    }
  }
  store.sources.pop();
  store.added.pop();
  store.changed.pop();
  const columns = store.columns;
  if (columns) for (let i = 0; i < columns.length; i++) columns[i].pop();
  const order = store.order;
  if (order !== null) {
    const position = order.indexOf(entity);
    if (position >= 0) order.splice(position, 1);
  }
  return true;
}
