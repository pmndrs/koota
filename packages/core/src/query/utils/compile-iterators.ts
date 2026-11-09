import { $internal } from '../../common';
import type { SparseSet } from '@koota/collections';
import { machineRevision } from '../../machine/machine';
import type { Entity } from '../../entity/types';
import { isEntityAlive, isEntityReadable } from '../../entity/utils/entity-index';
import { ENTITY_ID_MASK } from '../../entity/utils/pack-entity';
import type { Store } from '../../storage';
import type { Trait } from '../../trait/types';
import type { WorldContext } from '../../world';
import type { QueryIterationBuffers, QueryViewBinding, TargetProjection } from '../types';

type Callback = (state: any, entity: Entity, index: number) => void;
type Iterate<R = void> = (
  ctx: WorldContext,
  entities: readonly Entity[],
  length: number,
  callback: Callback,
  buffers: QueryIterationBuffers,
  stores: Store<any>[]
) => R;

export type QueryIterators = {
  readEach: Iterate;
  /** Writes every trait back without change detection. */
  updateEach: Iterate;
  /** Writes every trait back and records changes for traits whose mode is not 0. Returns the count. */
  trackEach: Iterate<number>;
  /** updateEach and trackEach with each trait passed as its own argument. */
  each: Iterate;
  trackArgs: Iterate<number>;
  /** Drops references to user objects and restores owned tuple arrays. */
  release: (buffers: QueryIterationBuffers) => void;
};

type IteratorCache = {
  keys: WeakMap<Trait | TargetProjection, IteratorCache>;
  iterators: QueryIterators | undefined;
};

// Weak projection keys share iterators without retaining unused traits or world relation storage.
const iteratorCache: IteratorCache = { keys: new WeakMap(), iterators: undefined };

type CursorClass = new () => { o: number; changed: boolean };
/** write diffs and flags changes for tracked walks, plain stores bare, read drops writes. */
export type CursorKind = 'write' | 'plain' | 'read';
let iteratorSerial = 0;
const cursorClasses = new Map<string, Record<CursorKind, CursorClass>>();

/**
 * A cursor stands in for a SoA record during a walk. Its accessors read and write the current page
 * at the current offset, so nothing is copied in or out per entity. The write cursor marks itself
 * changed when a value differs, which tracked walks read after the callback. Untracked walks use
 * the plain cursor, whose setter is a bare store. The read cursor drops writes, which keeps
 * readEach read only. Traits with the same field names share a class, so a callback site that
 * handles several such traits stays monomorphic, as it did with plain record objects.
 */
export function createIterationCursor(trait: Trait, kind: CursorKind): object {
  const keys = Object.keys(trait.schema as object);
  const signature = keys.join('\0');
  let classes = cursorClasses.get(signature);
  if (classes === undefined) {
    classes = {
      write: compileCursorClass(keys, 'write'),
      plain: compileCursorClass(keys, 'plain'),
      read: compileCursorClass(keys, 'read'),
    };
    cursorClasses.set(signature, classes);
  }
  return new classes[kind]();
}

function compileCursorClass(keys: string[], kind: CursorKind): CursorClass {
  // Internal slots are hidden from enumeration, so spread and keys see nothing stale. The fields
  // themselves live on the prototype as accessors, which for..in and toJSON still report.
  const slots = ['o', 'changed', ...keys.map((_, k) => `$${k}`)];
  const fields = slots
    .map(
      (slot) =>
        `Object.defineProperty(this, ${JSON.stringify(slot)}, { value: ${
          slot === 'changed' ? 'false' : slot === 'o' ? '0' : 'null'
        }, writable: true, enumerable: false, configurable: false });`
    )
    .join(' ');
  const accessors = keys
    .map(
      (key, k) => `Object.defineProperty(Cursor.prototype, ${JSON.stringify(key)}, {
      get: function () { return this.$${k}[this.o]; },
      set: ${
        kind === 'write'
          ? `function (v) { var page = this.$${k}; if (page[this.o] !== v) { page[this.o] = v; this.changed = true; } }`
          : kind === 'plain'
            ? `function (v) { this.$${k}[this.o] = v; }`
            : 'function () {}'
      },
      enumerable: true,
      configurable: true,
    });`
    )
    .join('\n    ');
  const json = keys.map((key) => `${JSON.stringify(key)}: this.${key}`).join(', ');
  return new Function(
    `'use strict';
    function Cursor() { ${fields} }
    ${accessors}
    Object.defineProperty(Cursor.prototype, 'toJSON', { value: function () { return { ${json} }; } });
    return Cursor;`
  )() as CursorClass;
}

export function getQueryIterators(
  traits: Trait[],
  projection: QueryViewBinding['projection']
): QueryIterators {
  let cache = iteratorCache;
  for (let i = 0; i < projection.length; i++) {
    const key = projection[i];
    let next = cache.keys.get(key);
    if (next === undefined) {
      next = { keys: new WeakMap(), iterators: undefined };
      cache.keys.set(key, next);
    }
    cache = next;
  }
  return (cache.iterators ??= compileQueryIterators(traits, projection));
}

/**
 * Compiles a fresh iterator set. The serial line keeps every source distinct, since V8 hands
 * identical sources one shared function and feedback vector.
 * Unrolls each trait into its own accessor call site. Each site sees one function, so V8 can inline
 * the accessors no matter how many traits the app iterates elsewhere. Plain SoA traits bind a
 * cursor to the entity's page and offset instead of copying a record in and out.
 */
export function compileQueryIterators(
  traits: Trait[],
  projection: QueryViewBinding['projection']
): QueryIterators {
  const accessors: unknown[] = [];
  const bind: string[] = [];
  const hoist: string[] = [];
  const modes: string[] = [];
  const read: string[] = [];
  const rebind: string[] = [];
  const reset: string[] = [];
  const write: string[] = [];
  const trackLines: string[] = [];
  const snapshot: string[] = [];
  const release: string[] = [];
  const args: string[] = [];
  let cursors = false;
  let writeback = false;

  for (let j = 0; j < traits.length; j++) {
    const traitCtx = traits[j][$internal];
    const isSoA = traitCtx.type === 'soa';
    const stable =
      traitCtx.machine === undefined ? '' : `v${j} === machineRevision(ctx, T${j}, eid) && `;
    if (traitCtx.machine !== undefined) read.push(`var v${j} = machineRevision(ctx, T${j}, eid);`);
    accessors.push(isSoA ? traitCtx.getInto : traitCtx.get, traitCtx.set);
    bind.push(`const g${j} = a[${j * 2}], w${j} = a[${j * 2 + 1}], T${j} = traits[${j}];`);
    hoist.push(`var s${j} = stores[${j}];`);
    modes.push(`m${j} = modes[${j}]`);
    release.push(`state[${j}] = undefined;`);

    args.push(traitCtx.cursor && traitCtx.relation === null ? `c${j}` : `state[${j}]`);
    if (traitCtx.cursor && traitCtx.relation === null) {
      cursors = true;
      const keys = Object.keys(traits[j].schema as object);
      rebind.push(keys.map((key, k) => `c${j}.$${k} = s${j}.${key}[pg];`).join(' '));
      hoist.push(`var c${j} = records[${j}].__CURSOR__; state[${j}] = c${j};`);
      read.push(`c${j}.o = off;`);
      reset.push(`c${j}.changed = false;`);
      trackLines.push(
        `if (${stable}(c${j}.changed || m${j} === 3) && m${j} !== 0) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
      continue;
    }
    writeback = true;

    if (isSoA) {
      hoist.push(`var r${j} = records[${j}].value;`);
      release.push(`var r${j} = records[${j}].value;`);
      const schema = traits[j].schema as Record<string, unknown>;
      let k = 0;
      for (const key in schema) {
        const field = schema[key];
        const name = JSON.stringify(key);
        if (Array.isArray(field)) {
          // A callback may replace a tuple array, and the next read must not write into the replacement.
          hoist.push(`var t${j}_${k} = records[${j}].tuples[${name}];`);
          read.push(`r${j}[${name}] = t${j}_${k};`);
          release.push(`r${j}[${name}] = records[${j}].tuples[${name}];`);
          k++;
        } else if (field == null || typeof field === 'function') {
          release.push(`r${j}[${name}] = undefined;`);
        }
      }
      read.push(`state[${j}] = g${j}(ctx, eid, s${j}, r${j});`);
    } else {
      read.push(`state[${j}] = g${j}(ctx, eid, s${j});`);
    }

    const writeCall = `w${j}(ctx, eid, s${j}, state[${j}])`;
    write.push(stable ? `if (${stable}true) ${writeCall};` : `${writeCall};`);
    if (isSoA) {
      trackLines.push(
        `if (${stable}(${writeCall} || m${j} === 3) && m${j} !== 0) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    } else {
      // An atomic value mutated in place is the same reference, so compare its snapshot.
      snapshot.push(`if (m${j} === 2) snapshotAtomic(state[${j}], snapshots, ${j});`);
      trackLines.push(
        `if (${stable}(${writeCall} ? m${j} !== 0 : m${j} === 3 || m${j} === 2 && atomicChanged(state[${j}], snapshots[${j}]))) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    }
  }

  // Target values stay in positional arguments and never enter trait writeback or tracking.
  // Constants and match sets belong to the binding, so shared iterators read them per walk.
  const targetHoist: string[] = [];
  const targetRebind: string[] = [];
  let traitIndex = 0;
  const projectedArgs = projection.map((part, j) => {
    if (typeof part === 'function') return args[traitIndex++];
    if (part.mode === 'constant') {
      targetHoist.push(`var tc${j} = buffers.binding.targets[${j}];`);
      return `tc${j}`;
    }
    targetHoist.push(`var rt${j} = instances[${j}].relationTargets${cursors ? `, rp${j}` : ''};`);
    if (cursors) targetRebind.push(`rp${j} = rt${j}[pg];`);
    const slot = cursors ? `rp${j}[off]` : `rt${j}[eid >>> 10][eid & 1023]`;
    if (part.mode === 'slot') return slot;
    targetHoist.push(`var ts${j} = buffers.targetSnapshots[${j}];`);
    if (part.mode === 'copy') return `copyTargetSnapshot(${slot}, ts${j})`;
    targetHoist.push(`var tf${j} = buffers.binding.targets[${j}];`);
    return `filterTargetSnapshot(${slot}, ts${j}, tf${j})`;
  });

  // Structural changes can invalidate later entries. A row whose entity was evicted, or which
  // left the query since the walk began, is skipped before its storage is read. The index
  // revision moves on either event, so the gate costs one compare per entity until the first
  // one of the walk. Every cursor rebinds its pages together when the page changes, which is one
  // compare per entity however many traits the walk reads.
  const setup = (cursor: 'value' | 'plain' | 'reader', positional = false) => `
    var state = buffers.state, records = buffers.records, index = ctx.entityIndex;
    var revision = index.revision;${cursors ? ' var lastPg = -1;' : ''}
    ${hoist.join('\n    ').replace(/__CURSOR__/g, cursor)}${positional && targetHoist.length ? '\n    ' + targetHoist.join('\n    ') : ''}`;
  const loop = (body: string, positional = false) => `
    for (var i = 0; i < length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};
      if (index.revision !== revision && skipsEntry(index, entity, buffers)) continue;${
        cursors
          ? ` var pg = eid >>> 10, off = eid & 1023;
      if (pg !== lastPg) { lastPg = pg; ${rebind.join(' ')}${positional && targetRebind.length ? ' ' + targetRebind.join(' ') : ''} }`
          : ''
      }
      ${read.join('\n      ')}
      ${body}
    }`;
  // Record and AoS traits write back after the callback, which needs the entity still alive.
  const alive = writeback ? 'if (!isEntityAlive(index, entity)) continue;' : '';
  // Positional callbacks take the trait values in registers instead of through the state array.
  const arrayCall = 'callback(state, entity, i);';
  const argsCall = `callback(${[...projectedArgs, 'entity', 'i'].join(', ')});`;
  const update = (call: string, positional = false) =>
    `${setup('plain', positional)}${loop(
      `${call}
      ${alive}
      ${write.join('\n      ')}`,
      positional
    )}`;
  const track = (call: string, positional = false) => `${setup('value', positional)}
    var modes = buffers.modes${modes.length ? ', ' + modes.join(', ') : ''};
    var snapshots = buffers.atomicSnapshots, changedEntities = buffers.changedEntities;
    var changedTraits = buffers.changedTraits, changed = 0;${loop(
      `${snapshot.join('\n      ')}
      ${reset.join(' ')}
      ${call}
      ${alive}
      ${trackLines.join('\n      ')}`,
      positional
    )}
      return changed;`;

  return new Function(
    'a',
    'traits',
    'instances',
    'skipsEntry',
    'isEntityAlive',
    'snapshotAtomic',
    'atomicChanged',
    'machineRevision',
    'copyTargetSnapshot',
    'filterTargetSnapshot',
    `'use strict';
  // iterators ${iteratorSerial++}
  ${bind.join('\n  ')}
  return {
    readEach: function read(ctx, entities, length, callback, buffers, stores) {${setup('reader')}${loop(
      'callback(state, entity, i);'
    )}
    },
    updateEach: function update(ctx, entities, length, callback, buffers, stores) {${update(arrayCall)}
    },
    trackEach: function track(ctx, entities, length, callback, buffers, stores) {${track(arrayCall)}
    },
    each: function each(ctx, entities, length, callback, buffers, stores) {${update(argsCall, true)}
    },
    trackArgs: function trackArgs(ctx, entities, length, callback, buffers, stores) {${track(argsCall, true)}
    },
    release: function release(buffers) {
      var state = buffers.state, records = buffers.records;
      ${release.join('\n      ')}
    },
  };`
  )(
    accessors,
    traits.slice(),
    // Relation instances by projection position, so the hoists read storage with one load.
    projection.map((part) => (typeof part === 'function' ? undefined : part.instance)),
    skipsEntry,
    isIterationEntityAlive,
    snapshotAtomic,
    atomicChanged,
    machineRevision,
    copyTargetSnapshot,
    filterTargetSnapshot
  ) as QueryIterators;
}

/** Copies before the callback so structural commands cannot change its target list. */
function copyTargetSnapshot(targets: readonly Entity[], snapshot: Entity[]): Entity[] {
  const length = targets.length;
  for (let i = 0; i < length; i++) snapshot[i] = targets[i];
  if (snapshot.length !== length) trimTargetSnapshot(snapshot, length);
  return snapshot;
}

/** Copies only the targets inside the pair's target query, so the callback sees what matched. */
function filterTargetSnapshot(
  targets: readonly Entity[],
  snapshot: Entity[],
  matches: SparseSet
): Entity[] {
  let length = 0;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (matches.has(target)) snapshot[length++] = target;
  }
  if (snapshot.length !== length) trimTargetSnapshot(snapshot, length);
  return snapshot;
}

/** Popping keeps the backing store, which a length write would release. */
function trimTargetSnapshot(snapshot: Entity[], length: number) {
  while (snapshot.length > length) snapshot.pop();
}

/**
 * Decides whether a walk skips a row once the index revision has moved, that is after a handle
 * release or a query removal. Removed walks keep retained dead entities but drop evicted ones.
 * A walk over a query also drops rows that left it since the walk began, whether the removal
 * was deferred by a live view or applied at once under a sorted or owned copy, so a callback
 * never reads storage a relation or trait removal already cleared.
 */
function skipsEntry(
  index: WorldContext['entityIndex'],
  entity: Entity,
  buffers: QueryIterationBuffers
): boolean {
  if (!(buffers.retains ? isEntityReadable(index, entity) : isEntityAlive(index, entity))) {
    return true;
  }
  const query = buffers.query;
  if (query === null) return false;
  if (query.toRemove !== null && query.toRemove.has(entity)) return true;
  return !query.exposed.has(entity);
}

function isIterationEntityAlive(index: WorldContext['entityIndex'], entity: Entity): boolean {
  return isEntityAlive(index, entity);
}

// hasOwnProperty.call inside for-in hits a V8 fast path that Object.hasOwn does not.
function snapshotAtomic(
  value: any,
  snapshots: QueryIterationBuffers['atomicSnapshots'],
  index: number
) {
  if (typeof value !== 'object' || value === null) return;
  const snapshot = (snapshots[index] ??= { keys: [], values: [], count: 0 });
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    snapshot.keys[count] = key;
    snapshot.values[count++] = value[key];
  }
  snapshot.count = count;
}

function atomicChanged(value: any, snapshot: QueryIterationBuffers['atomicSnapshots'][number]) {
  if (typeof value !== 'object' || value === null) return false;
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    let index = count++;
    if (snapshot.keys[index] !== key) {
      index = snapshot.keys.indexOf(key);
      if (index === -1 || index >= snapshot.count) return true;
    }
    if (value[key] !== snapshot.values[index]) return true;
  }
  return count !== snapshot.count;
}
