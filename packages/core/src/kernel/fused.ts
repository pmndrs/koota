import {
  emitAppend,
  emitRowCopy,
  emitSwapRemove,
  ensureCapacity,
  type Archetype,
  type Fused,
  type FusedDestroy,
  type FusedMany,
  type FusedMove,
  type FusedSpawn,
  type TypeRecord,
} from './archetype';
import { abortMutation, beginMutation, endMutation } from './commands';
import { VACANT } from './entity';
import { INDEX_BITS, INDEX_MASK, MAX_GENERATION, PAIR_FLAG, type TypeId } from './id';
import { applyFlips, createFlips, hasTrackers, refreshFlips } from './query';
import { definitions, sparseFlags } from './registry';
import { traverseAdd, traverseRemove, type World } from './world';

/**
 * Fused quiet mutations.
 *
 * Adding or removing one plain trait, spawning, and destroying normally run a
 * pipeline of checks and notification passes. When nothing observes the world
 * (`world.quiet`) and no trait involved has a hook, the whole operation is a
 * fixed sequence for a given source and destination archetype, so it compiles
 * into one function: append the row with shared columns and stamps copied and
 * new columns constructed, swap-remove the source row, repoint the entity, bump
 * trait versions and flip observed static queries. Row appends, copies and
 * swap-removes come from the emitters in `archetype.ts`, shared with the
 * general path. Numeric columns and stamps past an archetype's length are
 * never read, so a vacated tail is only cleared for columns that could hold
 * references. Factories run inside a mutation scope, so work they start queues
 * exactly as on the general path.
 *
 * A generated function reads its archetypes, flips, type ids, defaults and
 * factories from the `Fused` record it is called with, so its source depends
 * only on the shape of the transition. Equal shapes share one function, which
 * keeps the cache bounded and lets rebuilt archetypes, other worlds and other
 * traits of the same layout reuse code that is already warm.
 */

const compiled = new Map<string, unknown>();

/**
 * The function for one generated body, created once per distinct source. It
 * is named after its kind and gets a source URL numbered by its place in the
 * cache, so profiles and debuggers show `fused_add` in
 * `koota-fused-add-12.js` rather than an anonymous eval.
 */
function instantiate<F>(kind: string, params: string, body: string): F {
  const source = `${params}|${body}`;
  let fn = compiled.get(source);
  if (fn === undefined) {
    const name = `fused_${kind.replace('-', '_')}`;
    const url = `koota-fused-${kind}-${compiled.size}.js`;
    // oxlint-disable-next-line typescript/no-implied-eval -- Generated code is the point: one specialized function per shape.
    fn = new Function(
      'GROW',
      'HT',
      'RF',
      'AF',
      'BEGIN',
      'ABORT',
      'END',
      `return function ${name}(${params}){${body}}\n//# sourceURL=${url}`
    )(ensureCapacity, hasTrackers, refreshFlips, applyFlips, beginMutation, abortMutation, endMutation);
    compiled.set(source, fn);
  }
  return fn as F;
}

function noop(): void {}

/** The fused add or remove of an archetype that already has, or lacks, the traits: nothing to do. */
export const noopFused: Fused<FusedMove & FusedMany> = { fn: noop, from: null!, to: null!, flips: null!, consts: [] };

/** Whether any trait of an archetype has a typed observer listening. */
export function isWatched(world: World, archetype: Archetype): boolean {
  if (archetype.watchEpoch !== world.watchEpoch) {
    const types = archetype.types;
    let any = false;
    for (let i = 0; i < types.length; i++) if (world.watched[types[i]] !== undefined) any = true;
    archetype.watchedAny = any;
    archetype.watchEpoch = world.watchEpoch;
  }
  return archetype.watchedAny;
}

type Gen = { consts: unknown[]; scoped: boolean };

/**
 * A value the generated code reads from `K` instead of embedding it. Type ids,
 * defaults and factories all go through here, so the source depends only on
 * the shape of the archetypes and plans and the `compiled` cache stays bounded.
 */
function constant(value: unknown, gen: Gen): string {
  gen.consts.push(value);
  return `K[${gen.consts.length - 1}]`;
}

/** Whether a trait's hooks forbid constructing it without calling them. */
function hooked(type: TypeId): boolean {
  const hooks = definitions[type]?.hooks ?? null;
  return hooks !== null && (hooks.onAdd !== null || hooks.onSet !== null);
}

/** Whether constructing a trait runs a factory. */
function hasFactory(type: TypeId): boolean {
  const plan = definitions[type]!.plan;
  return plan !== null && plan.factories.some((factory) => factory !== null);
}

function plainType(type: TypeId): boolean {
  return type < PAIR_FLAG && sparseFlags[type] !== 1 && definitions[type]!.relationIndex < 0;
}

/**
 * Statements that construct one new record in `row`. `value` names a variable
 * holding the supplied value, or is null when none can be supplied. A supplied
 * value wins field by field, other fields take their factory or default, and
 * the changed stamp is set once a value was supplied. A tag takes the stamp
 * only when `spawning`, as on the general path.
 */
function construct(
  slot: number,
  record: TypeRecord,
  value: string | null,
  row: string,
  entity: string,
  gen: Gen,
  spawning: boolean
): string {
  const plan = record.plan;
  let code = '';
  if (plan !== null) {
    const factory = (i: number): string => {
      const fn = plan.factories[i];
      if (fn === null) return constant(plan.defaults[i], gen);
      gen.scoped = true;
      return `${constant(fn, gen)}(w,${entity})`;
    };
    const column = `tcol${slot}`;
    if (plan.aos) {
      code += `${column}[0][${row}]=${value === null ? factory(0) : `${value}===undefined?${factory(0)}:${value}`};\n`;
    } else {
      let plain = '';
      let valued = '';
      for (let i = 0; i < plan.fields.length; i++) {
        const key = JSON.stringify(plan.fields[i]);
        plain += `${column}[${i}][${row}]=${factory(i)};`;
        valued += `${column}[${i}][${row}]=(${key} in ${value})?${value}[${key}]:${factory(i)};`;
      }
      code += value === null ? `${plain}\n` : `if(${value}===undefined){${plain}}else{${valued}}\n`;
    }
  }
  if (value !== null && (plan !== null || spawning)) {
    const at = slot === 0 ? '' : `${slot}*tc+`;
    code += `if(${value}!==undefined){TC[${at}${row}]=rv;if(rv>MC[${slot}])MC[${slot}]=rv;}\n`;
  }
  return code;
}

/** The value of the argument for a new slot: `args[perm[slot]]` is a trait or a `[trait, value]` pair. */
function emitArgument(slot: number): string {
  return `var a${slot}=args[perm[${slot}]],v${slot}=typeof a${slot}==='function'?undefined:a${slot}[1];\n`;
}

/** Re-derives the observed query flips when the observed list changed, then counts the mutation or tells subscribers. */
function emitFlips(from: string, to: string, entity: string): string {
  return `if(S.epoch!==w.observedEpoch)RF(w,S,${from},${to});\nif(S.queries.length!==0){if(w.subscribed)AF(w,S,${entity});else if(S.pending++===0)w.dirtyFlips.push(S);}\n`;
}

/** Wraps user-code statements in a mutation scope that closes in the function's tail. */
function scoped(gen: Gen, body: string): string {
  return gen.scoped ? `BEGIN(w);try{\n${body}}catch(x){ABORT(w);throw x;}\nEND(w);\n` : body;
}

/**
 * Compiles the move from one archetype to another. `types` are the traits
 * added or the one removed. A single add takes its value as `v`. `many`
 * transitions read each new slot's value through `emitArgument`.
 */
function compileTransition<F extends FusedMove | FusedMany>(
  from: Archetype,
  to: Archetype,
  types: readonly TypeId[],
  adding: boolean,
  many: boolean
): Fused<F> {
  const gen: Gen = { consts: [], scoped: false };
  let args = '';
  let built = '';
  for (let slot = 0; slot < to.slotRecords.length; slot++) {
    const record = to.slotRecords[slot];
    if (from.records.get(record.type) !== undefined) continue;
    if (many) args += emitArgument(slot);
    built += construct(slot, record, many ? `v${slot}` : 'v', 'toRow', 'e', gen, false);
  }
  let tail = '';
  if (adding) {
    for (let i = 0; i < types.length; i++) {
      tail += `var y${i}=${constant(types[i], gen)};w.traitVersions[y${i}]=(w.traitVersions[y${i}]|0)+1;\n`;
      tail += `if(w.removed.size>0){var m${i}=w.removed.get(y${i});if(m${i}!==undefined)m${i}.delete(e);}\n`;
    }
  } else {
    tail += `var y=${constant(types[0], gen)};\n`;
    tail += 'if(HT()){var m=w.removed.get(y);if(m===undefined)w.removed.set(y,m=new Map());m.set(e,rv);}\n';
    tail += 'w.traitVersions[y]=(w.traitVersions[y]|0)+1;\n';
  }
  const body =
    'var F=t.from,T=t.to,S=t.flips,K=t.consts;\n' +
    'var row=w.rowOf[ix],e=F.entities[row],toRow=T.entities.length;\n' +
    emitAppend('T', 'toRow', 'e') +
    emitRowCopy(from, to) +
    args +
    emitSwapRemove(from, 'F', false, `w.rowOf[sw&${INDEX_MASK}]=row;`) +
    'w.archetypeOf[ix]=T.id;w.rowOf[ix]=toRow;\n' +
    scoped(gen, built + tail + emitFlips('F', 'T', 'e'));
  const kind = many ? 'many' : adding ? 'add' : 'remove';
  const params = many ? 'w,t,ix,rv,args,perm' : 'w,t,ix,rv,v';
  return { fn: instantiate<F>(kind, params, body), from, to, flips: createFlips(), consts: gen.consts };
}

/**
 * Uses a transition, spawn or destroy takes on the general path before it
 * compiles, so archetypes that only a few entities pass through never pay for
 * code generation.
 */
export const tier = { uses: 16 };

/**
 * Counts one general path use of an archetype's cache slot `key`. True once
 * the slot has been used often enough to compile. Keys: an add is the type id
 * times 2, a remove that plus 1, a multiple add minus 8 minus the destination
 * id times 2, and spawns and destroys small negatives.
 */
function warmed(archetype: Archetype, key: number): boolean {
  const counts = (archetype.fusedUses ??= new Map());
  const uses = (counts.get(key) ?? 0) + 1;
  if (uses <= tier.uses) {
    counts.set(key, uses);
    return false;
  }
  counts.delete(key);
  return true;
}

/**
 * The fused add of a plain trait from an archetype, `noopFused` when the
 * archetype already holds it, or null when this add takes the general path:
 * the trait has a hook, or the transition has not been used often enough.
 */
export function prepareFusedAdd(world: World, from: Archetype, type: TypeId): Fused<FusedMove> | null {
  if (from.byType[type] !== undefined) return (from.fusedAdd[type] = noopFused);
  if (!plainType(type) || hooked(type)) return (from.fusedAdd[type] = null);
  if (!warmed(from, type * 2)) return null;
  return (from.fusedAdd[type] = compileTransition(from, traverseAdd(world, from, type), [type], true, false));
}

/** `prepareFusedAdd` for removal: `noopFused` when the archetype lacks the trait, null for an `onRemove` hook or a sparse trait. */
export function prepareFusedRemove(world: World, from: Archetype, type: TypeId): Fused<FusedMove> | null {
  const record = from.byType[type];
  if (record === undefined) return (from.fusedRemove[type] = sparseFlags[type] !== 1 ? noopFused : null);
  if (record.onRemove !== null) return (from.fusedRemove[type] = null);
  if (!warmed(from, type * 2 + 1)) return null;
  return (from.fusedRemove[type] = compileTransition(from, traverseRemove(world, from, type), [type], false, false));
}

/**
 * The fused add of several plain traits in one transition from `from` to `to`,
 * or null when one of them has a hook, more than one runs a factory, or the
 * transition is still warming up. The general path keeps several factories in
 * argument order.
 */
export function prepareFusedAddMany(from: Archetype, to: Archetype, added: readonly TypeId[]): Fused<FusedMany> | null {
  let factories = 0;
  for (const type of added) {
    if (!plainType(type) || hooked(type)) return (from.fusedMany[to.id] = null);
    if (hasFactory(type)) factories++;
  }
  if (factories > 1) return (from.fusedMany[to.id] = null);
  if (!warmed(from, -8 - to.id * 2)) return null;
  return (from.fusedMany[to.id] = compileTransition(from, to, added, true, true));
}

/**
 * The fused spawn into an archetype of plain traits, or null when a trait has
 * a hook, more than one trait runs a factory, or the spawn is still warming
 * up. Valueless spawns skip every value check. A valued spawn reads each
 * slot's value through `emitArgument`.
 */
export function prepareSpawner(archetype: Archetype, valued: boolean): Fused<FusedSpawn> | null {
  const records = archetype.slotRecords;
  let fusable = true;
  let factories = 0;
  for (let i = 0; i < records.length; i++) {
    if (!plainType(records[i].type) || hooked(records[i].type)) fusable = false;
    else if (hasFactory(records[i].type)) factories++;
  }
  if (factories > 1) fusable = false;
  if (fusable && !warmed(archetype, valued ? -2 : -1)) return null;
  let spawner: Fused<FusedSpawn> | null = null;
  if (fusable) {
    const gen: Gen = { consts: [], scoped: false };
    let columns = '';
    let args = '';
    let stamps = '';
    let built = '';
    let versions = '';
    for (let slot = 0; slot < records.length; slot++) {
      const record = records[slot];
      const at = slot === 0 ? '' : `${slot}*tc+`;
      stamps += `TA[${at}row]=rv;TC[${at}row]=0;if(rv>MA[${slot}])MA[${slot}]=rv;\n`;
      if (record.plan !== null) columns += `var tcol${slot}=tr[${slot}].columns;\n`;
      if (valued) args += emitArgument(slot);
      built += construct(slot, record, valued ? `v${slot}` : null, 'row', 'entity', gen, true);
      versions += `var y${slot}=${constant(record.type, gen)};tv[y${slot}]=(tv[y${slot}]|0)+1;\n`;
    }
    const body =
      'var A=t.to,S=t.flips,K=t.consts;\n' +
      `var entity=(w.generations[ix]<<${INDEX_BITS})|ix,row=A.entities.length;\n` +
      emitAppend('A', 'row', 'entity') +
      'var tc=A.capacity,TA=A.added,TC=A.changed,MA=A.maxAdded,MC=A.maxChanged,tr=A.slotRecords,tv=w.traitVersions;\n' +
      columns +
      args +
      stamps +
      'w.archetypeOf[ix]=A.id;w.rowOf[ix]=row;w.aliveCount++;\n' +
      scoped(gen, built + versions + emitFlips('null', 'A', 'entity')) +
      'return entity;';
    spawner = {
      fn: instantiate<FusedSpawn>(valued ? 'spawn-valued' : 'spawn', 'w,t,ix,rv,args,perm', body),
      from: archetype,
      to: archetype,
      flips: createFlips(),
      consts: gen.consts,
    };
  }
  if (valued) archetype.valuedSpawner = spawner;
  else archetype.spawner = spawner;
  return spawner;
}

/**
 * The fused destroy of an entity that holds only plain traits with no remove
 * hook, or null when this destroy takes the general path. It swap-removes
 * the row, retires the slot and flips observed static queries.
 */
export function prepareDestroyer(archetype: Archetype): Fused<FusedDestroy> | null {
  let destroyer: Fused<FusedDestroy> | null = null;
  const records = archetype.slotRecords;
  let plain = true;
  for (let i = 0; i < records.length; i++) {
    if (records[i].onRemove !== null || records[i].type >= PAIR_FLAG) plain = false;
  }
  if (plain && !warmed(archetype, -3)) return null;
  if (plain) {
    const body =
      'var A=t.from,S=t.flips;\n' +
      'var row=w.rowOf[ix],e=A.entities[row];\n' +
      emitSwapRemove(archetype, 'A', false, `w.rowOf[sw&${INDEX_MASK}]=row;`) +
      `w.aliveCount--;w.archetypeOf[ix]=${VACANT};\n` +
      `var g=w.generations[ix];if(g<${MAX_GENERATION}){w.generations[ix]=g+1;w.free.push(ix);}\n` +
      emitFlips('A', 'null', 'e');
    destroyer = { fn: instantiate<FusedDestroy>('destroy', 'w,t,ix', body), from: archetype, to: archetype, flips: createFlips(), consts: [] };
  }
  archetype.destroyer = destroyer;
  return destroyer;
}
