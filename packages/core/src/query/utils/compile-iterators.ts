import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { isEntityAlive, isEntityReadable } from '../../entity/utils/entity-index';
import { ENTITY_ID_MASK } from '../../entity/utils/pack-entity';
import type { Store } from '../../storage';
import type { Trait } from '../../trait/types';
import type { WorldContext } from '../../world';
import type { QueryIterationBuffers } from '../types';

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
  traits: WeakMap<Trait, IteratorCache>;
  iterators: QueryIterators | undefined;
};

// Weak keys at every position share iterators across worlds without retaining unused traits.
const iteratorCache: IteratorCache = { traits: new WeakMap(), iterators: undefined };

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

export function getQueryIterators(traits: Trait[]): QueryIterators {
  let cache = iteratorCache;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    let next = cache.traits.get(trait);
    if (next === undefined) {
      next = { traits: new WeakMap(), iterators: undefined };
      cache.traits.set(trait, next);
    }
    cache = next;
  }
  return (cache.iterators ??= compileQueryIterators(traits));
}

/**
 * Compiles a fresh iterator set. The serial line keeps every source distinct, since V8 hands
 * identical sources one shared function and feedback vector.
 * Unrolls each trait into its own accessor call site. Each site sees one function, so V8 can inline
 * the accessors no matter how many traits the app iterates elsewhere. Plain SoA traits bind a
 * cursor to the entity's page and offset instead of copying a record in and out.
 */
export function compileQueryIterators(traits: Trait[]): QueryIterators {
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
        `if ((c${j}.changed || m${j} === 3) && m${j} !== 0) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
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
    write.push(`${writeCall};`);
    if (isSoA) {
      trackLines.push(
        `if ((${writeCall} || m${j} === 3) && m${j} !== 0) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    } else {
      // An atomic value mutated in place is the same reference, so compare its snapshot.
      snapshot.push(`if (m${j} === 2) snapshotAtomic(state[${j}], snapshots, ${j});`);
      trackLines.push(
        `if (${writeCall} ? m${j} !== 0 : m${j} === 3 || m${j} === 2 && atomicChanged(state[${j}], snapshots[${j}])) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    }
  }

  // Structural changes can invalidate later entries. Removed walks accept retained dead entities,
  // but skip evicted handles before reading a recycled slot. The check costs one compare until
  // the first release of the walk. Every cursor rebinds its pages together when the page changes,
  // which is one compare per entity however many traits the walk reads.
  const setup = (cursor: 'value' | 'plain' | 'reader') => `
    var state = buffers.state, records = buffers.records, index = ctx.entityIndex;
    var releases = index.releases, retains = buffers.retains;${cursors ? ' var lastPg = -1;' : ''}
    ${hoist.join('\n    ').replace(/__CURSOR__/g, cursor)}`;
  const loop = (body: string) => `
    for (var i = 0; i < length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};
      if (index.releases !== releases && !(retains ? isEntityReadable(index, entity) : isEntityAlive(index, entity))) continue;${
        cursors
          ? ` var pg = eid >>> 10, off = eid & 1023;
      if (pg !== lastPg) { lastPg = pg; ${rebind.join(' ')} }`
          : ''
      }
      ${read.join('\n      ')}
      ${body}
    }`;
  // Record and AoS traits write back after the callback, which needs the entity still alive.
  const alive = writeback ? 'if (!isEntityAlive(index, entity)) continue;' : '';
  // Positional callbacks take the trait values in registers instead of through the state array.
  const arrayCall = 'callback(state, entity, i);';
  const argsCall = `callback(${[...args, 'entity', 'i'].join(', ')});`;
  const update = (call: string) =>
    `${setup('plain')}${loop(`${call}
      ${alive}
      ${write.join('\n      ')}`)}`;
  const track = (call: string) => `${setup('value')}
    var modes = buffers.modes${modes.length ? ', ' + modes.join(', ') : ''};
    var snapshots = buffers.atomicSnapshots, changedEntities = buffers.changedEntities;
    var changedTraits = buffers.changedTraits, changed = 0;${loop(`${snapshot.join('\n      ')}
      ${reset.join(' ')}
      ${call}
      ${alive}
      ${trackLines.join('\n      ')}`)}
      return changed;`;

  return new Function(
    'a',
    'traits',
    'isEntityAlive',
    'isEntityReadable',
    'snapshotAtomic',
    'atomicChanged',
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
    each: function each(ctx, entities, length, callback, buffers, stores) {${update(argsCall)}
    },
    trackArgs: function trackArgs(ctx, entities, length, callback, buffers, stores) {${track(argsCall)}
    },
    release: function release(buffers) {
      var state = buffers.state, records = buffers.records;
      ${release.join('\n      ')}
    },
  };`
  )(
    accessors,
    traits.slice(),
    isIterationEntityAlive,
    isEntityReadable,
    snapshotAtomic,
    atomicChanged
  ) as QueryIterators;
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
