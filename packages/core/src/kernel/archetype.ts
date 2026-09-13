import type { Entity, TypeId } from './id';
import { markUsed, typeHooks, typePlan, type TraitHook } from './registry';
import { allocateColumn, clearSlot, growColumn, type Column, type ColumnPlan } from './schema';

/**
 * One type inside an archetype: its stamp slot, column plan, columns, and
 * remove hook. A single lookup by type id answers presence, data, and stamps.
 * Tags have no plan and no columns.
 */
export type TypeRecord = {
  readonly type: TypeId;
  /** Index in `types`, and the stamp slot. */
  readonly slot: number;
  readonly plan: ColumnPlan | null;
  /** Allocated with the first row. Null for tags and before any row exists. */
  columns: Column[] | null;
  readonly onRemove: TraitHook | null;
};

export type Archetype = {
  readonly id: number;
  /** Sorted ascending. */
  readonly types: readonly TypeId[];
  readonly key: string;
  readonly entities: Entity[];
  capacity: number;
  /** Type id to its record. */
  readonly records: Map<TypeId, TypeRecord>;
  /** Records aligned with `types`, so slot `i` is the record of `types[i]`. */
  readonly slotRecords: readonly TypeRecord[];
  /** Data-bearing records only, for row moves and clears. */
  readonly dataRecords: readonly TypeRecord[];
  /** Revision stamps, slot-major: `slot * capacity + row`. */
  added: Float64Array;
  changed: Float64Array;
  /** Upper bounds per slot, so tracking queries can skip untouched archetypes. */
  readonly maxAdded: Float64Array;
  readonly maxChanged: Float64Array;
  edges: Map<TypeId, Archetype> | null;
  /** Membership bits for the world's observed static queries, valid for `observedEpoch`. */
  observedMask: Uint32Array | null;
  observedEpoch: number;
};

const INITIAL_CAPACITY = 4;
const EMPTY = new Float64Array(0);

export function archetypeKey(types: readonly TypeId[]): string {
  return types.join(',');
}

export function createArchetype(id: number, types: readonly TypeId[]): Archetype {
  const records = new Map<TypeId, TypeRecord>();
  const slotRecords: TypeRecord[] = [];
  const dataRecords: TypeRecord[] = [];
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    markUsed(type);
    const record: TypeRecord = {
      type,
      slot: i,
      plan: typePlan(type),
      columns: null,
      onRemove: typeHooks(type)?.onRemove ?? null,
    };
    records.set(type, record);
    slotRecords.push(record);
    if (record.plan !== null) dataRecords.push(record);
  }
  return {
    id,
    types,
    key: archetypeKey(types),
    entities: [],
    capacity: 0,
    records,
    slotRecords,
    dataRecords,
    added: EMPTY,
    changed: EMPTY,
    maxAdded: new Float64Array(types.length),
    maxChanged: new Float64Array(types.length),
    edges: null,
    observedMask: null,
    observedEpoch: -1,
  };
}

function ensureCapacity(archetype: Archetype, required: number): void {
  if (archetype.capacity >= required) return;
  const slots = archetype.types.length;
  const dataRecords = archetype.dataRecords;
  if (archetype.capacity === 0) {
    const capacity = Math.max(INITIAL_CAPACITY, required);
    for (let d = 0; d < dataRecords.length; d++) {
      const record = dataRecords[d];
      const plan = record.plan!;
      const columns: Column[] = [];
      for (let i = 0; i < plan.fields.length; i++) columns.push(allocateColumn(plan, i, capacity));
      record.columns = columns;
    }
    archetype.added = new Float64Array(slots * capacity);
    archetype.changed = new Float64Array(slots * capacity);
    archetype.capacity = capacity;
    return;
  }
  const previous = archetype.capacity;
  let capacity = previous;
  while (capacity < required) capacity *= 2;
  for (let d = 0; d < dataRecords.length; d++) {
    const record = dataRecords[d];
    const columns = record.columns!;
    const numeric = record.plan!.numeric;
    for (let i = 0; i < columns.length; i++) growColumn(columns[i], capacity, numeric[i]);
  }
  const added = new Float64Array(slots * capacity);
  const changed = new Float64Array(slots * capacity);
  for (let slot = 0; slot < slots; slot++) {
    added.set(archetype.added.subarray(slot * previous, slot * previous + previous), slot * capacity);
    changed.set(archetype.changed.subarray(slot * previous, slot * previous + previous), slot * capacity);
  }
  archetype.added = added;
  archetype.changed = changed;
  archetype.capacity = capacity;
}

/** Appends a row. Every type stamps `added` with the revision; nothing counts as changed yet. */
export function appendEntity(archetype: Archetype, entity: Entity, revision: number): number {
  const row = archetype.entities.length;
  ensureCapacity(archetype, row + 1);
  archetype.entities.push(entity);
  const capacity = archetype.capacity;
  const slots = archetype.types.length;
  const maxAdded = archetype.maxAdded;
  for (let slot = 0; slot < slots; slot++) {
    archetype.added[slot * capacity + row] = revision;
    archetype.changed[slot * capacity + row] = 0;
    if (revision > maxAdded[slot]) maxAdded[slot] = revision;
  }
  return row;
}

/** Swap-removes a row and returns the entity moved into it, or 0. */
export function removeRow(archetype: Archetype, row: number): Entity {
  const entities = archetype.entities;
  const last = entities.length - 1;
  const capacity = archetype.capacity;
  const slots = archetype.types.length;
  let swapped = 0;
  const dataRecords = archetype.dataRecords;
  if (row !== last) {
    swapped = entities[last];
    entities[row] = swapped;
    for (let d = 0; d < dataRecords.length; d++) {
      const columns = dataRecords[d].columns!;
      for (let i = 0; i < columns.length; i++) columns[i][row] = columns[i][last];
    }
    for (let slot = 0; slot < slots; slot++) {
      archetype.added[slot * capacity + row] = archetype.added[slot * capacity + last];
      archetype.changed[slot * capacity + row] = archetype.changed[slot * capacity + last];
    }
  }
  entities.pop();
  for (let d = 0; d < dataRecords.length; d++) {
    const record = dataRecords[d];
    const columns = record.columns!;
    const numeric = record.plan!.numeric;
    for (let i = 0; i < columns.length; i++) clearSlot(columns[i], last, numeric[i]);
  }
  for (let slot = 0; slot < slots; slot++) {
    archetype.added[slot * capacity + last] = 0;
    archetype.changed[slot * capacity + last] = 0;
  }
  return swapped;
}

/**
 * Appends the row to `to`, copying shared columns and stamps. The caller
 * vacates the source row. A moved row may carry pending stamps, so the
 * destination's bounds advance to the current revision for those slots.
 */
export function copyRow(from: Archetype, row: number, to: Archetype, revision: number): number {
  const toRow = appendEntity(to, from.entities[row], revision);
  const fromRecords = from.records;
  const fromCapacity = from.capacity;
  const toCapacity = to.capacity;
  const slotRecords = to.slotRecords;
  for (let slot = 0; slot < slotRecords.length; slot++) {
    const record = slotRecords[slot];
    const source = fromRecords.get(record.type);
    if (source === undefined) continue;
    const columns = record.columns;
    if (columns !== null) {
      const sourceColumns = source.columns!;
      for (let i = 0; i < columns.length; i++) columns[i][toRow] = sourceColumns[i][row];
    }
    const added = from.added[source.slot * fromCapacity + row];
    const changed = from.changed[source.slot * fromCapacity + row];
    to.added[slot * toCapacity + toRow] = added;
    to.changed[slot * toCapacity + toRow] = changed;
    if (changed > 0 && revision > to.maxChanged[slot]) to.maxChanged[slot] = revision;
  }
  return toRow;
}

export function addedStamp(archetype: Archetype, type: TypeId, row: number): number {
  const record = archetype.records.get(type);
  return record === undefined ? 0 : archetype.added[record.slot * archetype.capacity + row];
}

export function changedStamp(archetype: Archetype, type: TypeId, row: number): number {
  const record = archetype.records.get(type);
  return record === undefined ? 0 : archetype.changed[record.slot * archetype.capacity + row];
}

export function stampChanged(archetype: Archetype, type: TypeId, row: number, revision: number): void {
  const record = archetype.records.get(type);
  if (record === undefined) return;
  const slot = record.slot;
  archetype.changed[slot * archetype.capacity + row] = revision;
  if (revision > archetype.maxChanged[slot]) archetype.maxChanged[slot] = revision;
}

export function insertType(types: readonly TypeId[], type: TypeId): TypeId[] {
  let low = 0;
  let high = types.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (types[mid] < type) low = mid + 1;
    else high = mid;
  }
  const next = types.slice();
  next.splice(low, 0, type);
  return next;
}
