import type { SparseSet } from '@koota/collections';
import { ENTITY_ID_MASK } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { sameParams } from '../query/query';
import { hasChangedQuery } from '../query/tracking';
import type { CursorKind, CursorSource } from '../storage/types';
import { hasSubscribers, notifyChanged } from '../trait/hooks';
import { getTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type {
  Callback,
  IterationBufferPool,
  IterationBuffers,
  IteratorCache,
  UpdateEachOptions,
  ViewBinding,
  ViewIterators,
} from './types';

// Weak projection keys share iterators without retaining unused traits or world relation storage.
const iteratorCache: IteratorCache = { keys: new WeakMap(), iterators: undefined };

let iteratorSerial = 0;

export function ensureViewIterators(
  traits: Trait[],
  projection: ViewBinding['projection']
): ViewIterators {
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
  return (cache.iterators ??= compileViewIterators(traits, projection));
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
function compileViewIterators(traits: Trait[], projection: ViewBinding['projection']): ViewIterators {
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

  for (let j = 0; j < traits.length; j++) {
    const traitCtx = traits[j][$internal];
    const record = `{ changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`;
    bind.push(`const T${j} = traits[${j}];`);
    hoist.push(`var s${j} = stores[${j}];`);
    modes.push(`m${j} = modes[${j}]`);
    release.push(`state[${j}] = undefined;`);

    const cursor = traitCtx.cursor;
    if (cursor !== undefined) {
      const c = `c${j}`;
      const source = cursor.compile(c, `s${j}`, 'pg', 'off');
      paged = true;
      args.push(c);
      hoist.push(`var ${c} = cursors[${j}].__KIND__; state[${j}] = ${c}; ${source.init}`);
      rebind.push(source.bind);
      seek.push(source.seek);
      // Scalar fields are written in place. Only tuple copies are stored after the callback.
      const flush = source.flush.plain;
      if (flush) {
        write.push(flush);
        writeArgs.push(flush);
      }
      const line = `${source.flush.write} if ((${source.changed} || m${j} === 3) && m${j} !== 0) ${record}`;
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
    write.push(`${writeCall};`);
    // An atomic value mutated in place is the same reference, so compare its snapshot.
    snapshot.push(`if (m${j} === 2) snapshotAtomic(r${j}, snapshots, ${j});`);
    const line = `if (${writeCall} ? m${j} !== 0 : m${j} === 3 || m${j} === 2 && atomicChanged(state[${j}], snapshots[${j}])) ${record}`;
    trackLines.push(line);
    // A positional callback holds the stored value itself and cannot replace it, so there is
    // nothing to set and only the snapshot can report a change.
    trackArgsLines.push(`if (m${j} === 2 && atomicChanged(r${j}, snapshots[${j}])) ${record}`);
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
    // The walk's defer scope keeps every target list as it is, so the stored value is passed as is.
    if (part.mode === 'slot') return slot;
    targetHoist.push(`var ts${j} = buffers.targetSnapshots[${j}];`);
    targetHoist.push(`var tf${j} = buffers.binding.targets[${j}];`);
    return `filterTargetSnapshot(${slot}, ts${j}, tf${j})`;
  });

  // A defer scope keeps every row's entity, traits and pairs alive until the walk ends.
  // Rebind all cursor pages together when the entity page changes.
  const setup = (kind: CursorKind, positional = false) => `
    var state = buffers.state, cursors = buffers.cursors;${paged ? ' var lastPg = -1;' : ''}
    ${hoist.join('\n    ').replace(/__KIND__/g, kind)}
    ${positional ? targetHoist.join('\n    ') : ''}`;
  const loop = (body: string, kind: CursorKind, positional = false) => `
    for (var i = 0; i < length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};${
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
  // Positional callbacks take the trait values in registers instead of through the state array.
  const arrayCall = 'callback(state, entity, i);';
  const argsCall = `callback(${[...projectedArgs, 'entity', 'i'].join(', ')});`;
  const update = (call: string, positional = false) =>
    `${setup('plain', positional)}${loop(
      `${call}
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
      ${(positional ? trackArgsLines : trackLines).join('\n      ')}`,
      'write',
      positional
    )}
      return changed;`;

  return new Function(
    'a',
    'traits',
    'instances',
    'snapshotAtomic',
    'atomicChanged',
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
    snapshotAtomic,
    atomicChanged,
    filterTargetSnapshot
  ) as ViewIterators;
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

// hasOwnProperty.call inside for-in hits a V8 fast path that Object.hasOwn does not.
function snapshotAtomic(value: any, snapshots: IterationBuffers['atomicSnapshots'], index: number) {
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

function atomicChanged(value: any, snapshot: IterationBuffers['atomicSnapshots'][number]) {
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

/**
 * Resolves change detection for a walk and runs the matching iterator. A positional walk that
 * finds nothing tracked records the world's tracking revision on the binding, so later walks
 * skip this check until a change observer is added.
 */
export function walkDetecting(
  ctx: WorldContext,
  binding: ViewBinding,
  entities: Entity[],
  length: number,
  callback: Callback,
  buffers: IterationBuffers,
  options: UpdateEachOptions | undefined,
  positional: boolean
) {
  const { traits, stores } = binding;
  const iterators = buffers.iterators!;
  if (trackTraits(ctx, traits, buffers.modes, options?.changeDetection) === 0) {
    if (positional) binding.untracked = ctx.trackingRevision;
    (positional ? iterators.each : iterators.updateEach)(
      ctx,
      entities,
      length,
      callback,
      buffers,
      stores
    );
    return;
  }
  let changedCount = 0;
  try {
    changedCount = (positional ? iterators.trackArgs : iterators.trackEach)(
      ctx,
      entities,
      length,
      callback,
      buffers,
      stores
    );
  } finally {
    clearAtomicSnapshots(buffers.atomicSnapshots);
  }
  const { changedEntities, changedTraits } = buffers;
  for (let i = 0; i < changedCount; i++) {
    notifyChanged(ctx, changedEntities[i], changedTraits[i]);
  }
}

/**
 * Marks every walked trait as possibly written. Version readers have no change events to rely
 * on, and a nested read may cache an order before the walk's last write, so this runs after it.
 */
export function bumpVersions(instances: TraitInstance[]) {
  for (let i = 0; i < instances.length; i++) instances[i].version++;
}

function createIterationBuffers(): IterationBuffers {
  return {
    state: [],
    binding: undefined,
    cursors: [],
    targetSnapshots: [],
    iterators: undefined,
    modes: [],
    atomicSnapshots: [],
    changedEntities: [],
    changedTraits: [],
    next: undefined,
  };
}

/**
 * Each active walk checks out its own buffers. A pool that belongs to one binding keeps its
 * prepared cursors. Views that share the world pool may need to rebind its buffers.
 */
export function takeIterationBuffers(
  pool: IterationBufferPool,
  binding: ViewBinding
): IterationBuffers {
  let buffers = pool.iterationBuffers;
  if (buffers === undefined) buffers = createIterationBuffers();
  else pool.iterationBuffers = buffers.next;
  if (buffers.binding !== binding) prepareIterationBuffers(buffers, binding);
  return buffers;
}

/**
 * Prepares buffers for a projection. Cursors already created for the same trait are kept. A
 * binding that arrives without iterators compiles its own, since every generated function with
 * the same source would otherwise share one feedback vector and its callback site would turn
 * megamorphic across queries. A binding nothing caches was given the shared set for its
 * projection when it was created.
 */
function prepareIterationBuffers(buffers: IterationBuffers, binding: ViewBinding) {
  const { traits, projection } = binding;
  const { state, cursors } = buffers;
  const prepared = buffers.binding?.traits;
  if (buffers.iterators !== undefined && sameParams(buffers.binding!.projection, projection)) {
    buffers.binding = binding;
    return;
  }
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    state[i] = undefined;
    if (prepared?.[i] === trait) continue;
    cursors[i] = trait[$internal].cursor?.create();
  }
  state.length = cursors.length = traits.length;
  for (let i = 0; i < projection.length; i++) {
    const part = projection[i];
    if (typeof part !== 'function' && part.mode === 'filter') {
      buffers.targetSnapshots[i] ??= [];
    }
  }
  buffers.binding = binding;
  buffers.iterators = binding.iterators ??= compileViewIterators(traits, projection);
}

/** Returns buffers to the pool. Array walks clear their borrowed state before returning them. */
export function releaseIterationBuffers(pool: IterationBufferPool, buffers: IterationBuffers) {
  buffers.next = pool.iterationBuffers;
  pool.iterationBuffers = buffers;
}

/** Only tracked walks take atomic snapshots, so only they drop the user objects held in them. */
function clearAtomicSnapshots(snapshots: IterationBuffers['atomicSnapshots']) {
  for (let s = 0; s < snapshots.length; s++) {
    const snapshot = snapshots[s];
    if (snapshot === undefined) continue;
    for (let i = 0; i < snapshot.values.length; i++) {
      const value = snapshot.values[i];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        snapshot.values[i] = undefined;
      }
    }
  }
}

/** Fills modes and returns how many traits are tracked. */
function trackTraits(
  ctx: WorldContext,
  traits: Trait[],
  modes: number[],
  changeDetection: UpdateEachOptions['changeDetection']
) {
  let trackedCount = 0;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    // Notifying costs a deferred pass per entity, so skip it when nothing can observe the change.
    const tracked =
      changeDetection === 'always'
        ? hasSubscribers(instance.changeSubscriptions) || instance.trackingQueries.length !== 0
        : changeDetection !== 'never' &&
          (hasSubscribers(instance.changeSubscriptions) || hasChangedQuery(instance));
    if (!tracked) {
      modes[i] = 0;
      continue;
    }
    modes[i] = changeDetection === 'always' ? 3 : trait[$internal].type === 'aos' ? 2 : 1;
    trackedCount++;
  }
  return trackedCount;
}
