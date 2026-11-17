import { $internal } from '../../common';
import type { SparseSet } from '@koota/collections';
import { machineRevision } from '../../machine/machine';
import type { Entity } from '../../entity/types';
import { isEntityAlive, isEntityReadable } from '../../entity/utils/entity-index';
import { ENTITY_ID_MASK } from '../../entity/utils/pack-entity';
import type { CursorKind, CursorSource, Store } from '../../storage';
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
  /** Passes the state array. Cursor writes are dropped and nothing is written back. */
  read: Iterate;
  /** Writes every trait back without change detection. */
  updateEach: Iterate;
  /** Writes every trait back and records changes for traits whose mode is not 0. Returns the count. */
  trackEach: Iterate<number>;
  /** updateEach and trackEach with each trait passed as its own argument. */
  each: Iterate;
  trackArgs: Iterate<number>;
  /** Drops references to user objects. */
  release: (buffers: QueryIterationBuffers) => void;
};

type IteratorCache = {
  keys: WeakMap<Trait | TargetProjection, IteratorCache>;
  iterators: QueryIterators | undefined;
};

// Weak projection keys share iterators without retaining unused traits or world relation storage.
const iteratorCache: IteratorCache = { keys: new WeakMap(), iterators: undefined };

let iteratorSerial = 0;

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
 * the accessors no matter how many traits the app iterates elsewhere. Storage is only reached
 * through the trait definition. A SoA trait is walked with its cursor, and its cursor compiler
 * writes the source that binds the cursor per page and moves it per entity. An AoS trait is
 * read with get, which returns the stored value.
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
  // Only array callbacks write AoS values through the shared state array.
  const stateRead: string[] = [];
  const rebind: string[] = [];
  const seek: CursorSource['seek'][] = [];
  const write: string[] = [];
  const writeArgs: string[] = [];
  const trackLines: string[] = [];
  const trackArgsLines: string[] = [];
  const snapshot: string[] = [];
  const release: string[] = [];
  const args: string[] = [];
  let paged = false;
  let writeback = false;
  let writebackArgs = false;

  for (let j = 0; j < traits.length; j++) {
    const traitCtx = traits[j][$internal];
    // A state trait may be swapped out when its machine changes state during the callback, so
    // its stores and change reports are skipped then. Other walked kinds need no guard.
    const stable =
      traitCtx.kind === 'machine' ? `v${j} === machineRevision(ctx, T${j}, eid) && ` : '';
    if (stable) read.push(`var v${j} = machineRevision(ctx, T${j}, eid);`);
    const record = `{ changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`;
    bind.push(`const T${j} = traits[${j}];`);
    hoist.push(`var s${j} = stores[${j}];`);
    modes.push(`m${j} = modes[${j}]`);
    release.push(`state[${j}] = undefined;`);

    const cursor = traitCtx.cursor;
    if (cursor !== undefined) {
      const c = `c${j}`;
      const source = cursor.compile(c, `s${j}`, 'pg', 'off');
      const guarded = (source: string) =>
        stable && source ? `if (${stable}true) { ${source} }` : source;
      paged = true;
      args.push(c);
      hoist.push(`var ${c} = cursors[${j}].__KIND__; state[${j}] = ${c}; ${source.init}`);
      rebind.push(source.bind);
      seek.push(source.seek);
      // Scalar fields are written in place. Only tuple copies are stored after the callback.
      const flush = guarded(source.flush.plain);
      if (flush) {
        write.push(flush);
        writeArgs.push(flush);
        writeback = writebackArgs = true;
      }
      const line = `${guarded(source.flush.write)} if (${stable}(${source.changed} || m${j} === 3) && m${j} !== 0) ${record}`;
      trackLines.push(line);
      trackArgsLines.push(line);
      continue;
    }

    bind.push(`const g${j} = a[${accessors.length}], w${j} = a[${accessors.length + 1}];`);
    accessors.push(traitCtx.get, traitCtx.set);
    args.push(`r${j}`);
    read.push(`var r${j} = g${j}(ctx, eid, s${j});`);
    stateRead.push(`state[${j}] = r${j};`);
    const writeCall = `w${j}(ctx, eid, s${j}, state[${j}])`;
    write.push(stable ? `if (${stable}true) ${writeCall};` : `${writeCall};`);
    writeback = true;
    // An atomic value mutated in place is the same reference, so compare its snapshot.
    snapshot.push(`if (m${j} === 2) snapshotAtomic(r${j}, snapshots, ${j});`);
    const line = `if (${stable}(${writeCall} ? m${j} !== 0 : m${j} === 3 || m${j} === 2 && atomicChanged(state[${j}], snapshots[${j}]))) ${record}`;
    trackLines.push(line);
    // A positional callback holds the stored value itself and cannot replace it, so there is
    // nothing to set and only the snapshot can report a change.
    trackArgsLines.push(
      `if (${stable}m${j} === 2 && atomicChanged(r${j}, snapshots[${j}])) ${record}`
    );
  }

  // Target values stay in positional arguments and never enter trait writeback or tracking.
  // Match sets belong to the binding, so shared iterators read them per walk.
  const targetHoist: string[] = [];
  const targetRebind: string[] = [];
  let traitIndex = 0;
  const projectedArgs = projection.map((part, j) => {
    if (typeof part === 'function') return args[traitIndex++];
    targetHoist.push(`var rt${j} = instances[${j}].relationTargets${paged ? `, rp${j}` : ''};`);
    if (paged) targetRebind.push(`rp${j} = rt${j}[pg];`);
    const slot = paged ? `rp${j}[off]` : `rt${j}[eid >>> 10][eid & 1023]`;
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
  const setup = (kind: CursorKind, positional = false) => `
    var state = buffers.state, cursors = buffers.cursors, index = ctx.entityIndex;
    var revision = index.revision;${paged ? ' var lastPg = -1;' : ''}
    ${hoist.join('\n    ').replace(/__KIND__/g, kind)}
    ${positional ? targetHoist.join('\n    ') : ''}`;
  const loop = (body: string, kind: CursorKind, positional = false) => `
    for (var i = 0; i < length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};
      if (index.revision !== revision && skipsEntry(index, entity, buffers)) continue;${
        paged
          ? ` var pg = eid >>> 10, off = eid & 1023;
      if (pg !== lastPg) { lastPg = pg; ${rebind.join(' ')}${positional && targetRebind.length ? ' ' + targetRebind.join(' ') : ''} }`
          : ''
      }
      ${seek.map((source) => source[kind]).join('\n      ')}
      ${read.join('\n      ')}
      ${positional ? '' : stateRead.join('\n      ')}
      ${body}
    }`;
  // Traits that store after the callback need the entity still alive. An entity only dies
  // through a handle release, which moves the revision, so an unmoved revision skips the lookup.
  const alive = (positional: boolean) =>
    (positional ? writebackArgs : writeback)
      ? 'if (index.revision !== revision && !isEntityAlive(index, entity)) continue;'
      : '';
  // Positional callbacks take the trait values in registers instead of through the state array.
  const arrayCall = 'callback(state, entity, i);';
  const argsCall = `callback(${[...projectedArgs, 'entity', 'i'].join(', ')});`;
  const update = (call: string, positional = false) =>
    `${setup('plain', positional)}${loop(
      `${call}
      ${alive(positional)}
      ${(positional ? writeArgs : write).join('\n      ')}`,
      'plain',
      positional
    )}`;
  const track = (call: string, positional = false) => `${setup('write', positional)}
    var modes = buffers.modes${modes.length ? ', ' + modes.join(', ') : ''};
    var snapshots = buffers.atomicSnapshots, changedEntities = buffers.changedEntities;
    var changedTraits = buffers.changedTraits, changed = 0;${loop(
      `${snapshot.join('\n      ')}
      ${call}
      ${alive(positional)}
      ${(positional ? trackArgsLines : trackLines).join('\n      ')}`,
      'write',
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
    read: function read(ctx, entities, length, callback, buffers, stores) {${setup('read')}${loop(
      'callback(state, entity, i);',
      'read'
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
      var state = buffers.state;
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
