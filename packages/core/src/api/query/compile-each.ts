import {
  getDefinition,
  isAlive,
  markChanged,
  type ColumnPlan,
  type Filter,
  type World as Kernel,
} from '../../kernel';
import type { Entity } from '../entity/types';
import { toLocal } from '../handles';
import { shallowEqual } from '../utils/shallow-equal';
import type { WorldState } from '../world/state';

/**
 * Runs the callback for each entity. Built for one list of traits by `compileEach`.
 * A loop built without the entity argument calls the callback with the records only.
 * `branches` are the matched archetype lists of a static query whose snapshot lists
 * their rows in order, and they are walked row by row. A null `branches` walks the
 * `entities` snapshot.
 */
export type EachLoop = (
  state: WorldState,
  kernel: Kernel,
  entities: readonly Entity[],
  callback: (values: unknown[], entity: Entity, index: number) => void,
  branches: readonly Filter[] | null
) => void;

type Entry = { source: string; name: string; loop: EachLoop; clones: Map<string, EachLoop> };

/**
 * The loops built for one list of trait ids, keyed by write mode, entity argument and
 * detecting traits.
 */
export type EachLayout = {
  readonly ids: readonly number[];
  readonly entries: Map<number | string, Entry | null>;
};

/** Keyed by trait ids. A trait's plan never changes, so the layout follows from the ids. */
const layouts = new Map<string, EachLayout>();
let built = 0;
let clones = 0;

export function eachLayout(ids: readonly number[]): EachLayout {
  const key = ids.join(',');
  let layout = layouts.get(key);
  if (layout === undefined) layouts.set(key, (layout = { ids, entries: new Map() }));
  return layout;
}

function build(source: string, name: string): EachLoop {
  // oxlint-disable-next-line no-new-func -- The loop is generated so field keys and the trait list are constants.
  const factory = new Function(
    'toLocal',
    'isAlive',
    'markChanged',
    'shallowEqual',
    `return ${source}
//# sourceURL=koota-each-${name}-${built++}.js`
  );
  return factory(toLocal, isAlive, markChanged, shallowEqual);
}

/**
 * Returns the readEach or updateEach loop for one list of traits. Field names, trait
 * ids and which traits detect changes are baked into the code, so every column load,
 * record literal and write-back compare has a constant key and no inner loop. Returns
 * null when code generation is unavailable, and the caller uses its generic loop.
 *
 * A loop shared by every caller sees many different callbacks, which keeps the engine
 * from inlining them. A run of 256 or more entities gets a copy of the loop per
 * callback source text instead, so each call site sees one callback and the engine
 * inlines it. Closures with the same text share a copy even when they capture
 * different values. At most 256 copies are made in total.
 */
export function compileEach(
  layout: EachLayout,
  write: boolean,
  entity: boolean,
  detect: readonly boolean[] | null,
  callback: (...args: never[]) => unknown,
  count: number
): EachLoop | null {
  // Bit 0 is the write mode, bit 1 the entity argument and bit t + 2 marks a detecting trait.
  // Longer lists use a string.
  let mask = (write ? 1 : 0) | (entity ? 2 : 0);
  if (detect !== null && detect.length < 29) {
    for (let t = 0; t < detect.length; t++) if (detect[t]) mask |= 4 << t;
  }
  const key = detect === null || detect.length < 29 ? mask : `${mask}:${detect.join()}`;
  let entry = layout.entries.get(key);
  if (entry === undefined) {
    try {
      const plans = layout.ids.map((id) => getDefinition(id).plan);
      const source = generate(layout.ids, plans, write, entity, detect ?? plans.map(() => false));
      const name = `${write ? 'update' : 'read'}${entity ? '' : '-records'}-${layout.ids.join('-')}`;
      entry = { source, name, loop: build(source, name), clones: new Map() };
    } catch {
      entry = null;
    }
    layout.entries.set(key, entry);
  }
  if (entry === null || count < 256 || clones >= 256) return entry?.loop ?? null;
  const text = Function.prototype.toString.call(callback);
  if (text.length > 1024) return entry.loop;
  let clone = entry.clones.get(text);
  if (clone === undefined) {
    clone = build(entry.source, entry.name);
    clones++;
    entry.clones.set(text, clone);
  }
  return clone;
}

/**
 * The generated loop has two phases. The archetype walk reads each row straight from
 * the columns of the matched archetypes, with no handle translation and no liveness
 * check. Each archetype's row version flags a callback that appended or removed rows
 * in it, which can shift the rows still to be visited. The walk checks the archetype
 * it is on after every row and each archetype when it reaches it, and on a change
 * hands the remaining entities of the snapshot to the second phase. That phase
 * resolves every handle, so removed entities arrive with undefined values.
 *
 * SoA records are scratch objects reused for every entity. A write-back stores a field
 * only when the callback changed it from the value read, so a trait set directly
 * during the callback survives. It reads the record back from the values array, so a
 * record the callback replaced with a new object is stored the same way. Detected changes are published after every trait is
 * stored, so an observer that moves or destroys the entity cannot redirect a store.
 *
 * An archetype holding every trait runs a lean row loop whose only branches besides
 * the write-back compares are the row version checks, which keeps the engine able to
 * inline the callback and drop the scratch records. Other archetypes run a general
 * row loop that tolerates absent traits.
 */
function generate(
  ids: readonly number[],
  plans: readonly (ColumnPlan | null)[],
  write: boolean,
  entity: boolean,
  detect: readonly boolean[]
): string {
  const key = JSON.stringify;
  const traits = plans.flatMap((plan, t) => (plan === null ? [] : [{ plan, t, id: ids[t] }]));
  type Data = (typeof traits)[number];
  const each = (fn: (data: Data) => string) => traits.map(fn).join('\n');
  const detected = traits.filter(({ t }) => detect[t]);
  const fields = ({ plan, t }: Data) => plan.fields.map((_, f) => `c${t}_${f}`);

  // One variable per column, loaded with the archetype, so a row access is one indexed load.
  const load = (target: string) => `{
const records = ${target}.records;
cached = ${target}.id;
let r;
${each(
  (data) => `r = records.get(${data.id});
c${data.t} = r === undefined || r.columns === null ? undefined : r.columns;
${fields(data)
  .map((v, f) => `${v} = c${data.t} === undefined ? undefined : c${data.t}[${f}];`)
  .join(' ')}`
)}
}`;

  // Reads one trait of `row` into its record. A write keeps the values read in `o` for the
  // write-back, and a detecting AoS trait keeps a shallow copy in `k`.
  const readTrait = ({ plan, t }: Data, declare: string) => {
    if (plan.aos) {
      if (!write) return `vals[${t}] = c${t}_0[row];`;
      const copy = detect[t] ? ` ${declare}k${t} = { ...o${t} };` : '';
      return `${declare}o${t} = c${t}_0[row]; vals[${t}] = o${t};${copy}`;
    }
    const copy = plan.fields.map((field, f) =>
      write
        ? `${declare}o${t}_${f} = c${t}_${f}[row]; s${t}[${key(field)}] = o${t}_${f};`
        : `s${t}[${key(field)}] = c${t}_${f}[row];`
    );
    return `${copy.join(' ')} vals[${t}] = s${t};`;
  };
  const readLean = each((data) => readTrait(data, 'const '));
  const readGeneral = `${plans.map((plan, t) => (plan === null ? `vals[${t}] = undefined;` : '')).join('')}
${each((data) => {
  const { plan, t } = data;
  const names = plan.aos
    ? [`o${t}`, ...(detect[t] ? [`k${t}`] : [])]
    : plan.fields.map((_, f) => `o${t}_${f}`);
  return `${write ? `let ${names.join(', ')};` : ''}
if (c${t} === undefined) vals[${t}] = undefined; else { ${readTrait(data, '')} }`;
})}`;

  // Stores what the callback changed in one trait at `row`, raising its `ch` flag when it detects.
  // The record is read back from `vals`, so a record the callback replaced is stored too.
  const storeTrait = ({ plan, t }: Data, row: string) => {
    const raise = detect[t] ? ` ch${t} = true;` : '';
    if (plan.aos) {
      const deep = detect[t] ? ` else if (!shallowEqual(w, k${t})) ch${t} = true;` : '';
      return `{ const w = vals[${t}]; if (w !== undefined) { if (w !== o${t}) { c${t}_0[${row}] = w;${raise} }${deep} } }`;
    }
    const stores = (record: string) =>
      plan.fields
        .map(
          (field, f) =>
            `{ const n = ${record}[${key(field)}]; if (n !== o${t}_${f}) { c${t}_${f}[${row}] = n;${raise} } }`
        )
        .join('\n');
    // One identity compare per row keeps the common case on the scratch record, whose shape is fixed.
    return `{ const w = vals[${t}]; if (w === s${t}) { ${stores(`s${t}`)} } else if (w !== undefined) { ${stores('w')} } }`;
  };

  // Stores every trait, then publishes the detected changes of entity `local`.
  // The lean form knows every trait is present.
  const writeBack = (row: string, local: string, lean: boolean) => {
    if (!write) return '';
    const stores = each((data) =>
      lean ? storeTrait(data, row) : `if (c${data.t} !== undefined) ${storeTrait(data, row)}`
    );
    if (detected.length === 0) return `{ ${stores} }`;
    return `{ const target = ${local};
let ${detected.map(({ t }) => `ch${t} = false`).join(', ')};
${stores}
${detected.map(({ t, id }) => `if (ch${t}) markChanged(kernel, target, ${id});`).join('\n')} }`;
  };

  // Finds where the entity of handle `handle` lives now and stores its writes there.
  const relocate = (handle: string) =>
    write
      ? `{ const moved = toLocal(state, ${handle});
if (moved !== 0 && isAlive(kernel, moved)) {
  const index = moved & 0x1fffff;
  const at = kernel.archetypeOf[index];
  if (at !== cached) ${load('archetypes[at]')}
  const cr = kernel.rowOf[index];
  ${writeBack('cr', 'moved', false)}
} }`
      : '';

  // Ends the walk after `row`, handing the rest of the snapshot to the second phase.
  const bail = (relocated: string) => `if (archetype.rowVersion !== base) {
${relocated}
i = first + row + 1;
bailed = true;
break walk;
}`;

  const rowLoop = (lean: boolean) => `for (let row = 0; row < count; row++) {
${lean ? readLean : readGeneral}
callback(vals${entity ? ', localToPublic[locals[row] & 0x1fffff], first + row' : ''});
${bail(relocate('entities[first + row]'))}
${writeBack('row', 'locals[row]', lean)}
${write && detected.length > 0 ? `// A change observer run by the write-back may have shifted rows too.\n${bail('')}` : ''}
}`;

  const records = plans.map((plan, t) =>
    plan === null || plan.aos
      ? ''
      : `const s${t} = { ${plan.fields.map((f) => `${key(f)}: 0`).join(', ')} };`
  );
  const columns = traits.map((data) => [`c${data.t}`, ...fields(data)].join(', '));
  const allPresent = traits.map(({ t }) => `c${t} !== undefined`).join(' && ') || 'true';

  return `function (state, kernel, entities, callback, branches) {
const archetypes = kernel.archetypes;
const vals = [${plans.map(() => 'undefined').join(', ')}];
${records.join('\n')}
${columns.length > 0 ? `let ${columns.join(', ')};` : ''}
let cached = -1, i = 0, bailed = false;
if (branches !== null) {
  // The archetypes matched at the start and their row versions. An archetype created during
  // the walk holds no entity of the snapshot, and one whose version moved before its turn ends the walk.
  const walked = [], bases = [];
  for (let b = 0; b < branches.length; b++) {
    const list = branches[b].archetypes;
    for (let a = 0; a < list.length; a++) {
      walked.push(list[a]);
      bases.push(list[a].rowVersion);
    }
  }
  walk: for (let k = 0; k < walked.length; k++) {
    const archetype = walked[k];
    const base = bases[k];
    if (archetype.rowVersion !== base) { bailed = true; break walk; }
    const locals = archetype.entities;
    const count = locals.length;
    if (count === 0) continue;
    if (archetype.id !== cached) ${load('archetype')}
    ${entity ? 'const localToPublic = state.localToPublic;' : ''}
    const first = i;
    if (${allPresent}) ${rowLoop(true)}
    else ${rowLoop(false)}
    i = first + count;
  }
  if (!bailed) return;
}
for (; i < entities.length; i++) {
  const entity = entities[i];
  const local = toLocal(state, entity);
  if (local === 0) {
    ${plans.map((_, t) => `vals[${t}] = undefined;`).join(' ')}
    callback(vals${entity ? ', entity, i' : ''});
    continue;
  }
  const index = local & 0x1fffff;
  const at = kernel.archetypeOf[index];
  if (at !== cached) ${load('archetypes[at]')}
  const row = kernel.rowOf[index];
  ${readGeneral}
  callback(vals${entity ? ', entity, i' : ''});
  ${relocate('entity')}
}
}`;
}
