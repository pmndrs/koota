import { beginDefer, endDefer } from '../command/buffer';
import type { Entity } from '../entity/types';
import type { WorldContext } from '../world/types';
import { endEach, takeIterationBuffers, walkEachDetecting } from './iteration';
import type {
  Callback,
  EntitySource,
  IterationBufferPool,
  ViewBinding,
  ViewIterator,
  WalkGuard,
} from './types';

/**
 * Shared traversal over entity sequences. Every callback walk opens a defer scope, so structural
 * changes made by callbacks apply when the outermost walk ends and no row loses its data under
 * it. A for...of loop opens none and only keeps its starting sequence. Ordered sources retain the
 * arrays read by active walks. toArray returns a plain array the caller owns.
 */
export class EntityView {
  ctx: WorldContext;
  binding: ViewBinding;
  source: EntitySource;
  /** Null when nothing else can change the sequence while it is read. */
  guard: WalkGuard | null;
  /** Where walks of this view check out their buffers. */
  pool: IterationBufferPool;

  constructor(
    ctx: WorldContext,
    binding: ViewBinding,
    source: EntitySource,
    guard: WalkGuard | null,
    pool: IterationBufferPool
  ) {
    this.ctx = ctx;
    this.binding = binding;
    this.source = source;
    this.guard = guard;
    this.pool = pool;
  }

  getSource(): EntitySource {
    return this.source;
  }

  get length() {
    return this.getSource().length;
  }

  get first(): Entity | undefined {
    const { dense, length } = this.getSource();
    return length !== 0 ? (dense[0] as Entity) : undefined;
  }

  at(index: number): Entity | undefined {
    const { dense, length } = this.getSource();
    index = Math.trunc(index) || 0;
    if (index < 0) index += length;
    return index >= 0 && index < length ? (dense[index] as Entity) : undefined;
  }

  /**
   * Walks the sequence present when the loop starts. Nothing bounds an iterator's lifetime, so it
   * holds no defer scope and changes made by the loop body apply at once. It registers as a reader
   * of its source instead, and a change to a source with readers moves it to a fresh array.
   */
  [Symbol.iterator](): IterableIterator<Entity> {
    const source = this.getSource();
    const dense = source.dense as Entity[];
    // Trim retired slots so V8 can share the loop bound with the array access.
    if (dense.length !== source.length) dense.length = source.length;
    const guard = this.guard;
    if (guard) guard.readers++;
    // A local cursor can be eliminated by V8. Reuse its result to avoid per-entity allocations.
    return {
      index: 0,
      length: dense.length,
      dense,
      source,
      guard,
      result: { value: 0 as Entity, done: false },
      next: nextViewIterator,
      return: returnViewIterator,
      [Symbol.iterator]: iterateViewIterator,
    } as ViewIterator;
  }

  toArray(): Entity[] {
    const { dense, length } = this.getSource();
    return dense.slice(0, length) as Entity[];
  }

  forEach(callback: (entity: Entity, index: number) => void) {
    const { dense, length } = this.getSource();
    const guard = this.guard;
    if (guard) guard.iterating++;
    beginDefer(this.ctx);
    try {
      for (let i = 0; i < length; i++) callback(dense[i] as Entity, i);
    } finally {
      if (guard) guard.iterating--;
      endDefer(this.ctx);
    }
  }

  map<U>(callback: (entity: Entity, index: number) => U): U[] {
    const result: U[] = [];
    this.forEach((entity, index) => result.push(callback(entity, index)));
    return result;
  }

  /**
   * The untracked walk is the whole hot body. It stays small so V8 can inline it together with
   * the generated iterator into the calling function, where the callback is a known constant.
   * Everything a change observer needs is one call away.
   */
  each(callback: Callback) {
    const { dense, length } = this.getSource();
    if (length === 0) return this;
    const { ctx, binding, pool } = this;
    const guard = this.guard;
    const entities = dense as Entity[];
    const buffers = takeIterationBuffers(pool, binding);
    buffers.pool = pool;
    buffers.guard = guard;
    if (guard) guard.iterating++;
    beginDefer(ctx);
    if (binding.untracked === ctx.trackingRevision) {
      // The compiled walk ends the walk itself when the callback throws.
      buffers.iterators!.each(ctx, entities, length, callback, buffers, binding.stores);
      endEach(ctx, buffers);
    } else {
      walkEachDetecting(ctx, binding, entities, length, callback, buffers);
    }
    return this;
  }
}

function nextViewIterator(this: ViewIterator): IteratorResult<Entity> {
  const index = this.index >>> 0;
  let value = 0 as Entity;
  let done = true;
  if (index < this.length) {
    value = this.dense[index] as Entity;
    this.index = (index + 1) | 0;
    done = false;
  } else {
    finishViewIterator(this);
  }
  this.result.value = value;
  this.result.done = done;
  return this.result as IteratorResult<Entity>;
}

function returnViewIterator(this: ViewIterator): IteratorResult<Entity> {
  finishViewIterator(this);
  return this.result as IteratorResult<Entity>;
}

function iterateViewIterator(this: ViewIterator) {
  return this;
}

/**
 * Closes the walk once. The source stops counting this reader only while it still holds the
 * array the reader walked. Once a change has detached it there is nothing left to release, and
 * an iterator that never finishes costs its source one copy.
 */
function finishViewIterator(iterator: ViewIterator) {
  if (!iterator.result.done) {
    iterator.result.done = true;
    iterator.index = iterator.length;
    const guard = iterator.guard;
    if (guard !== null && iterator.source.dense === iterator.dense) guard.readers--;
  }
}
