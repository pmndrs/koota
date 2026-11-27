import type { SparseSet } from '@koota/collections';
import { endDefer } from '../command/buffer';
import { ENTITY_ID_MASK } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { sameParams } from '../query/query';
import { hasChangedQuery } from '../query/tracking';
import { compilePageLoop } from '../storage/cursors';
import type { CursorKind, CursorSource } from '../storage/types';
import { hasSubscribers, notifyChanged } from '../trait/hooks';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type {
  Callback,
  IterationBufferPool,
  IterationBuffers,
  IteratorCache,
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
  const tracked: string[] = [];
  const read: string[] = [];
  const rebind: string[] = [];
  const seek: CursorSource['seek'][] = [];
  const write: string[] = [];
  const detect: string[] = [];
  const snapshot: string[] = [];
  const args: string[] = [];
  let paged = false;

  for (let j = 0; j < traits.length; j++) {
    const traitCtx = traits[j][$internal];
    const record = `{ changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`;
    bind.push(`const T${j} = traits[${j}];`);
    hoist.push(`var s${j} = stores[${j}];`);
    tracked.push(`var observed${j} = buffers.tracked[${j}];`);

    const cursor = traitCtx.cursor;
    if (cursor !== undefined) {
      const c = `c${j}`;
      const source = cursor.compile(c, `s${j}`);
      paged = true;
      args.push(c);
      hoist.push(`var ${c} = cursors[${j}].__KIND__; ${source.init}`);
      rebind.push(source.bind);
      seek.push(source.seek);
      // Scalar fields are written in place. Only tuple copies are stored after the callback.
      if (source.flush.plain) write.push(source.flush.plain);
      detect.push(`${source.flush.write} if (${source.changed} && observed${j}) ${record}`);
      continue;
    }

    // The callback holds the stored value itself and cannot replace it, so there is nothing to
    // write back. A value mutated in place is the same reference, so its snapshot is compared.
    bind.push(`const g${j} = a[${accessors.length}];`);
    accessors.push(traitCtx.get);
    args.push(`r${j}`);
    read.push(`var r${j} = g${j}(ctx, eid, s${j});`);
    snapshot.push(`if (observed${j}) snapshotAtomic(r${j}, snapshots, ${j});`);
    detect.push(`if (observed${j} && atomicChanged(r${j}, snapshots[${j}])) ${record}`);
  }

  // Target values are passed as arguments and never enter trait writeback or tracking.
  // Match sets belong to the binding, so shared iterators read them per walk.
  let traitIndex = 0;
  const projectedArgs = projection.map((part, j) => {
    if (typeof part === 'function') return args[traitIndex++];
    hoist.push(`var rt${j} = instances[${j}].relationTargets${paged ? `, rp${j}` : ''};`);
    if (paged) rebind.push(`rp${j} = rt${j}[pg];`);
    const slot = paged ? `rp${j}[off]` : `rt${j}[eid >>> 10][eid & 1023]`;
    // The walk's defer scope keeps every target list as it is, so the stored value is passed as is.
    if (part.mode === 'slot') return slot;
    hoist.push(`var ts${j} = buffers.targetSnapshots[${j}];`);
    hoist.push(`var tf${j} = buffers.binding.targets[${j}];`);
    return `filterTargetSnapshot(${slot}, ts${j}, tf${j})`;
  });

  // A defer scope keeps every row's entity, traits and pairs alive until the walk ends.
  const setup = (kind: CursorKind) => `
    var cursors = buffers.cursors;
    ${hoist.join('\n    ').replace(/__KIND__/g, kind)}`;
  // Each trait is passed as its own argument, so the values stay in registers.
  const call = `callback(${[...projectedArgs, 'entity', 'i'].join(', ')});`;
  // The step for one entity is the same under every loop.
  const step = (kind: CursorKind, before: string[], after: string[]) => `
      ${seek.map((source) => source[kind]).join('\n      ')}
      ${read.join('\n      ')}
      ${before.join('\n      ')}
      ${call}
      ${after.join('\n      ')}`;
  // The loop comes from the storage the walked traits live in. Every stored trait is kept in
  // sparse pages, so a walk with cursors runs the page loop. Any other binds nothing and steps
  // through the list.
  const loop = (body: string) =>
    paged
      ? compilePageLoop(rebind.join(' '), body)
      : `
    for (var i = 0; i < length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};
      ${body}
    }`;
  // A guarded step ends the walk when it throws, so the caller needs no try block. Around the
  // whole walk a try keeps V8 from moving checks and loads out of the loop once the walk is
  // inlined. Around one step it costs nothing.
  const guard = (body: string) => `try {${body}
      } catch (error) { endEach(ctx, buffers); throw error; }`;

  return new Function(
    'a',
    'traits',
    'instances',
    'snapshotAtomic',
    'atomicChanged',
    'filterTargetSnapshot',
    'endEach',
    `'use strict';
  // iterators ${iteratorSerial++}
  ${bind.join('\n  ')}
  return {
    each: function each(ctx, entities, length, callback, buffers, stores) {${setup('plain')}${loop(guard(step('plain', [], write)))}
    },
    track: function track(ctx, entities, length, callback, buffers, stores) {${setup('write')}
    ${tracked.join('\n    ')}
    var snapshots = buffers.atomicSnapshots, changedEntities = buffers.changedEntities;
    var changedTraits = buffers.changedTraits, changed = 0;${loop(step('write', snapshot, detect))}
      return changed;
    },
  };`
  )(
    accessors,
    traits.slice(),
    // Relation instances by projection position, so the hoists read storage with one load.
    projection.map((part) => (typeof part === 'function' ? undefined : part.instance)),
    snapshotAtomic,
    atomicChanged,
    filterTargetSnapshot,
    endEach
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
 * The each walk when a change observer may have appeared. A walk that finds nothing tracked
 * records the world's tracking revision on the binding, so later walks skip this check until
 * an observer is added. Kept apart so each itself holds no try block.
 */
export function walkDetecting(
  ctx: WorldContext,
  binding: ViewBinding,
  entities: Entity[],
  length: number,
  callback: Callback,
  buffers: IterationBuffers
) {
  const { instances, stores } = binding;
  const iterators = buffers.iterators!;
  if (!trackTraits(instances, buffers.tracked)) {
    binding.untracked = ctx.trackingRevision;
    // The untracked walk ends itself when the callback throws.
    iterators.each(ctx, entities, length, callback, buffers, stores);
    endEach(ctx, buffers);
    return;
  }
  try {
    const changedCount = iterators.track(ctx, entities, length, callback, buffers, stores);
    const { changedEntities, changedTraits } = buffers;
    for (let i = 0; i < changedCount; i++) {
      notifyChanged(ctx, changedEntities[i], changedTraits[i]);
    }
  } finally {
    clearAtomicSnapshots(buffers.atomicSnapshots);
    endEach(ctx, buffers);
  }
}

/**
 * Ends an each walk and returns its buffers to their pool. The untracked walk calls it when a
 * callback throws, and whoever started that walk calls it when it returns. Changes are reported
 * before the deferred structural changes apply.
 */
export function endEach(ctx: WorldContext, buffers: IterationBuffers) {
  const { guard, pool } = buffers;
  if (guard) guard.iterating--;
  bumpVersions(buffers.binding!.instances);
  buffers.next = pool.iterationBuffers;
  pool.iterationBuffers = buffers;
  endDefer(ctx);
}

/**
 * Marks every walked trait as possibly written. Version readers have no change events to rely
 * on, and a nested read may cache an order before the walk's last write, so this runs after it.
 */
function bumpVersions(instances: TraitInstance[]) {
  for (let i = 0; i < instances.length; i++) instances[i].version++;
}

function createIterationBuffers(pool: IterationBufferPool): IterationBuffers {
  return {
    binding: undefined,
    cursors: [],
    targetSnapshots: [],
    iterators: undefined,
    tracked: [],
    atomicSnapshots: [],
    changedEntities: [],
    changedTraits: [],
    next: undefined,
    pool,
    guard: null,
  };
}

/**
 * Each active walk checks out its own buffers, which go back to the pool they came from. A pool
 * that belongs to one binding keeps its prepared cursors. Views that share the world pool may
 * need to rebind its buffers.
 */
export function takeIterationBuffers(
  pool: IterationBufferPool,
  binding: ViewBinding
): IterationBuffers {
  let buffers = pool.iterationBuffers;
  if (buffers === undefined) buffers = createIterationBuffers(pool);
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
  const cursors = buffers.cursors;
  const prepared = buffers.binding?.traits;
  if (buffers.iterators !== undefined && sameParams(buffers.binding!.projection, projection)) {
    buffers.binding = binding;
    return;
  }
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    if (prepared?.[i] === trait) continue;
    cursors[i] = trait[$internal].cursor?.create();
  }
  cursors.length = traits.length;
  for (let i = 0; i < projection.length; i++) {
    const part = projection[i];
    if (typeof part !== 'function' && part.mode === 'filter') {
      buffers.targetSnapshots[i] ??= [];
    }
  }
  buffers.binding = binding;
  buffers.iterators = binding.iterators ??= compileViewIterators(traits, projection);
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

/** Records which traits have a change observer for this walk. */
function trackTraits(instances: TraitInstance[], tracked: boolean[]) {
  let anyTracked = false;
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    tracked[i] = hasSubscribers(instance.changeSubscriptions) || hasChangedQuery(instance);
    if (tracked[i]) anyTracked = true;
  }
  return anyTracked;
}
