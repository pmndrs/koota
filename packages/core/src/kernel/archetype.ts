import { PAIR_FLAG, type Entity, type TypeId } from './id';
import type { Flips } from './query';
import type { World } from './world';
import { markUsed, typeHooks, typePlan, type TraitHook } from './registry';
import { allocateColumn, growColumn, type Column, type ColumnPlan } from './schema';

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

/**
 * A whole quiet mutation generated for one transition, spawn or destroy: the
 * row move or append, version bump and observed static query flips. `fn` is
 * shared by every record of the same shape and reads the archetypes, flips and
 * constants from the record it receives.
 */
export type Fused<F = FusedMove> = {
  readonly fn: F;
  readonly from: Archetype;
  readonly to: Archetype;
  readonly flips: Flips;
  readonly consts: unknown[];
};

/** Adds or removes one trait of the entity at `index`. An add takes its supplied value, if any, as `value`. */
export type FusedMove = (world: World, fused: Fused<FusedMove>, index: number, revision: number, value?: unknown) => void;
/** Adds several traits. `args[perm[slot]]` is the argument for each new slot, a trait or a `[trait, value]` pair. */
export type FusedMany = (
  world: World,
  fused: Fused<FusedMany>,
  index: number,
  revision: number,
  args: readonly unknown[],
  perm: readonly number[]
) => void;
/** Creates an entity in the free slot `index`, reading values as `FusedMany` does, and returns it. */
export type FusedSpawn = (
  world: World,
  fused: Fused<FusedSpawn>,
  index: number,
  revision: number,
  args: readonly unknown[],
  perm: readonly number[]
) => Entity;
/** Destroys the entity at `index` and frees its slot. */
export type FusedDestroy = (world: World, fused: Fused<FusedDestroy>, index: number) => void;

type MoveFn = (from: Archetype, row: number, to: Archetype, toRow: number, revision: number) => Entity;

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
  /** Neighbor by the type added or removed, indexed by type id. */
  readonly edges: (Archetype | undefined)[];
  /** Neighbors by aggregate pair type, whose ids are too large to index an array. */
  pairEdges: Map<TypeId, Archetype> | null;
  /** Records of plain traits indexed by type id, so hot paths skip the map. Pairs live only in `records`. */
  readonly byType: (TypeRecord | undefined)[];
  /** Generated swap-remove, built on first use. */
  remove: ((a: Archetype, row: number) => Entity) | null;
  /** Generated row moves into this archetype, by source archetype id. */
  readonly moveFns: (MoveFn | undefined)[];
  /** Fused quiet add and remove of a plain trait, by type id. Null marks a transition that must take the general path. */
  readonly fusedAdd: (Fused<FusedMove> | null | undefined)[];
  readonly fusedRemove: (Fused<FusedMove> | null | undefined)[];
  /** Fused add of several traits at once, by destination archetype id. */
  readonly fusedMany: (Fused<FusedMany> | null | undefined)[];
  /** Fused quiet spawn into and destroy out of this archetype. Null marks one that must take the general path. */
  spawner: Fused<FusedSpawn> | null | undefined;
  valuedSpawner: Fused<FusedSpawn> | null | undefined;
  destroyer: Fused<FusedDestroy> | null | undefined;
  /** General path uses of fused mutations that have not compiled yet, by cache slot. Kept apart so the caches hold only records. */
  fusedUses: Map<number, number> | null;
  /** Whether any type here is watched, valid for `watchEpoch`. */
  watchedAny: boolean;
  watchEpoch: number;
  /** Membership bits for the world's observed static queries, valid for `observedEpoch`. */
  observedMask: Uint32Array | null;
  observedEpoch: number;
  /** Advances on every row append and removal, so an iteration can tell that its rows shifted. */
  rowVersion: number;
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
  const byType: (TypeRecord | undefined)[] = [];
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
    if (type < PAIR_FLAG) byType[type] = record;
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
    edges: [],
    pairEdges: null,
    byType,
    remove: null,
    moveFns: [],
    fusedAdd: [],
    fusedRemove: [],
    fusedMany: [],
    spawner: undefined,
    valuedSpawner: undefined,
    destroyer: undefined,
    fusedUses: null,
    watchedAny: false,
    watchEpoch: -1,
    observedMask: null,
    observedEpoch: -1,
    rowVersion: 0,
  };
}

export function ensureCapacity(archetype: Archetype, required: number): void {
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
  archetype.rowVersion++;
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
  return (archetype.remove ??= compileRemove(archetype))(archetype, row);
}

/*
 * Code emitters shared by the generated row moves and removes here and the
 * fused mutations in `fused.ts`. Every generated append, copy and swap-remove
 * goes through them, so a change to row layout or bookkeeping lands in one
 * place for both paths: `emitAppend` and `appendEntity` are the only row
 * appends, and `emitSwapRemove`, through `removeRow` on the general path, the
 * only row removal. Each of them advances the archetype's `rowVersion`, which
 * an each loop compares to notice shifted rows. Generated code that appends
 * needs `GROW` bound to `ensureCapacity`.
 */

/** Appends `entity` to archetype `a` as row `row`, growing its storage first. */
export function emitAppend(a: string, row: string, entity: string): string {
  return `if(${row}>=${a}.capacity)GROW(${a},${row}+1);${a}.rowVersion++;${a}.entities.push(${entity});\n`;
}

/**
 * Copies row `row` of archetype `F` into the just appended row `toRow` of
 * `T`: shared columns and stamps carry over, new slots stamp `added` with
 * `rv` and leave their columns to the caller. A carried pending change
 * advances the destination bounds. Declares `fr`, `tr`, `fc`, `tc`, `FA`,
 * `FC`, `TA`, `TC`, `MA`, `MC`, and `tcol<slot>` for every destination slot
 * with data, so callers can construct new columns.
 */
export function emitRowCopy(from: Archetype, to: Archetype): string {
  let head =
    'var fr=F.slotRecords,tr=T.slotRecords,fc=F.capacity,tc=T.capacity,FA=F.added,FC=F.changed,TA=T.added,TC=T.changed,MA=T.maxAdded,MC=T.maxChanged;\n';
  let body = '';
  for (let slot = 0; slot < to.slotRecords.length; slot++) {
    const record = to.slotRecords[slot];
    const source = from.records.get(record.type);
    const t = slot === 0 ? '' : `${slot}*tc+`;
    if (record.plan !== null) head += `var tcol${slot}=tr[${slot}].columns;\n`;
    if (source === undefined) {
      body += `TA[${t}toRow]=rv;TC[${t}toRow]=0;if(rv>MA[${slot}])MA[${slot}]=rv;\n`;
      continue;
    }
    const f = source.slot === 0 ? '' : `${source.slot}*fc+`;
    if (record.plan !== null) {
      head += `var fcol${slot}=fr[${source.slot}].columns;\n`;
      for (let i = 0; i < record.plan.fields.length; i++) body += `tcol${slot}[${i}][toRow]=fcol${slot}[${i}][row];\n`;
    }
    body += `TA[${t}toRow]=FA[${f}row];var ch${slot}=FC[${f}row];TC[${t}toRow]=ch${slot};if(ch${slot}>0&&rv>MC[${slot}])MC[${slot}]=rv;\n`;
  }
  return head + body;
}

/**
 * Swap-removes row `row` of archetype variable `a`: the last row overwrites it
 * across entities, columns and stamps, runs `onSwap` with the moved entity in
 * `sw`, then the last row is dropped. `sw` stays 0 when the removed row was
 * last. A vacated tail always drops column references. `clearAll` also zeroes
 * numeric columns and stamps, which nothing reads past an archetype's length.
 */
export function emitSwapRemove(archetype: Archetype, a: string, clearAll: boolean, onSwap = ''): string {
  let head = `${a}.rowVersion++;var SE=${a}.entities,last=SE.length-1,sw=0,sk=${a}.capacity,SA=${a}.added,SC=${a}.changed,SR=${a}.dataRecords;\n`;
  let swap = '';
  let clear = '';
  const records = archetype.dataRecords;
  for (let d = 0; d < records.length; d++) {
    head += `var s${d}=SR[${d}].columns;\n`;
    const plan = records[d].plan!;
    for (let i = 0; i < plan.fields.length; i++) {
      swap += `s${d}[${i}][row]=s${d}[${i}][last];\n`;
      if (!plan.numeric[i]) clear += `s${d}[${i}][last]=undefined;\n`;
      else if (clearAll) clear += `s${d}[${i}][last]=0;\n`;
    }
  }
  for (let slot = 0; slot < archetype.types.length; slot++) {
    const at = slot === 0 ? '' : `${slot}*sk+`;
    swap += `SA[${at}row]=SA[${at}last];SC[${at}row]=SC[${at}last];\n`;
    if (clearAll) clear += `SA[${at}last]=0;SC[${at}last]=0;\n`;
  }
  return `${head}if(row!==last){sw=SE[last];SE[row]=sw;${onSwap}\n${swap}}\nSE.pop();\n${clear}`;
}

/** Generates the swap-remove for one archetype with its slot and column counts unrolled. Equal shapes share source text, as for `compileMove`. */
function compileRemove(archetype: Archetype): (a: Archetype, row: number) => Entity {
  const body = `${emitSwapRemove(archetype, 'a', true)}return sw;`;
  // oxlint-disable-next-line typescript/no-implied-eval -- Generated code is the point: one unrolled remove per archetype.
  return new Function(`return function removeRow(a,row){${body}}\n//# sourceURL=koota-remove.js`)() as (
    a: Archetype,
    row: number
  ) => Entity;
}

/** Entity swapped into the vacated source row by the last `moveRow`, or 0. */
export let movedSwapped: Entity = 0;

/**
 * Moves a row between archetypes in one pass: appends to `to`, copying shared
 * columns and stamps, then swap-removes the source row. Returns the new row
 * and leaves the entity swapped into the vacated row in `movedSwapped`.
 */
export function moveRow(from: Archetype, row: number, to: Archetype, revision: number): number {
  const toRow = to.entities.length;
  movedSwapped = (to.moveFns[from.id] ??= compileMove(from, to))(from, row, to, toRow, revision);
  return toRow;
}

/**
 * Generates the append and copy for one transition with slot mapping, shared
 * columns and stamp copies unrolled, so no map lookups or loops run per move,
 * then swap-removes the source row through `removeRow`. Returns the entity
 * swapped into the vacated row. The source carries no archetype ids, so equal
 * shapes in any world hit the engine's compilation cache.
 */
function compileMove(from: Archetype, to: Archetype): MoveFn {
  const body = `${emitAppend('T', 'toRow', 'F.entities[row]')}${emitRowCopy(from, to)}return RR(F,row);`;
  // oxlint-disable-next-line typescript/no-implied-eval -- Generated code is the point: one unrolled move per transition.
  return new Function('GROW', 'RR', `return function moveRow(F,row,T,toRow,rv){${body}}\n//# sourceURL=koota-move.js`)(
    ensureCapacity,
    removeRow
  ) as MoveFn;
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
