import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, ordered, relation, trait, type Entity } from 'koota';

/** Native iteration with the metadata an array-backed view would carry. */
class ArrayView extends Array<Entity> {
  context = null;
  binding = null;
  version = 0;
}

/** Delegation keeps the native iterator without requiring the view itself to be an array. */
class NativeView {
  dense: Entity[];

  constructor(dense: Entity[]) {
    this.dense = dense;
  }

  [Symbol.iterator](): IterableIterator<Entity> {
    return this.dense[Symbol.iterator]();
  }
}

class SnapshotView extends NativeView {
  override [Symbol.iterator]() {
    return this.dense.slice()[Symbol.iterator]();
  }
}

/** A cursor whose result is either itself or a short-lived record. */
class Cursor implements IterableIterator<Entity> {
  value = 0 as Entity;
  done = true;
  index = 0;
  length = 0;
  dense: Entity[] = [];

  view: CursorView;

  constructor(view: CursorView) {
    this.view = view;
  }

  start() {
    this.dense = this.view.dense;
    this.length = this.dense.length;
    this.index = 0;
    this.done = false;
    this.view.iterating++;
    return this;
  }

  next(): IteratorResult<Entity> {
    if (this.index < this.length) {
      this.value = this.dense[this.index++];
      return this as IteratorResult<Entity>;
    }
    return this.return();
  }

  return(): IteratorResult<Entity> {
    if (!this.done) {
      this.done = true;
      this.view.iterating--;
      this.view.cursor = this;
    }
    return this as IteratorResult<Entity>;
  }

  [Symbol.iterator]() {
    return this;
  }
}

class RecordCursor extends Cursor {
  override next(): IteratorResult<Entity> {
    if (this.index < this.length) return { value: this.dense[this.index++], done: false };
    this.return();
    return { value: undefined, done: true };
  }
}

class CursorView {
  iterating = 0;
  cursor: Cursor | undefined = undefined;

  dense: Entity[];

  constructor(dense: Entity[]) {
    this.dense = dense;
  }

  [Symbol.iterator](): IterableIterator<Entity> {
    const cursor = this.cursor ?? new Cursor(this);
    this.cursor = undefined;
    return cursor.start();
  }
}

class PooledRecordView extends CursorView {
  override [Symbol.iterator]() {
    const cursor = this.cursor ?? new RecordCursor(this);
    this.cursor = undefined;
    return cursor.start();
  }
}

class FreshRecordView extends CursorView {
  override [Symbol.iterator]() {
    return new RecordCursor(this).start();
  }
}

class FixedDoneCursor extends Cursor {
  override next(): IteratorResult<Entity> {
    if (this.index < this.length) {
      this.value = this.dense[this.index++];
      this.done = false;
      return this as IteratorResult<Entity>;
    }
    return this.return();
  }
}

class FixedDoneView extends CursorView {
  override [Symbol.iterator]() {
    const cursor = this.cursor ?? new FixedDoneCursor(this);
    this.cursor = undefined;
    return cursor.start();
  }
}

/** Keeps the successful result's done field constant across every walk. */
class StableResultCursor implements IterableIterator<Entity> {
  value = 0 as Entity;
  readonly done = false;
  finished = true;
  index = 0;
  length = 0;
  dense: Entity[] = [];
  view: StableResultView;

  constructor(view: StableResultView) {
    this.view = view;
  }

  start() {
    this.dense = this.view.dense;
    this.length = this.dense.length;
    this.index = 0;
    this.finished = false;
    this.view.iterating++;
    return this;
  }

  next(): IteratorResult<Entity> {
    if (this.index < this.length) {
      this.value = this.dense[this.index++];
      return this;
    }
    return this.return();
  }

  return(): IteratorResult<Entity> {
    if (!this.finished) {
      this.finished = true;
      this.view.iterating--;
      this.view.cursor = this;
    }
    return this.view.end;
  }

  [Symbol.iterator]() {
    return this;
  }
}

class StableResultView {
  iterating = 0;
  cursor: StableResultCursor | undefined = undefined;
  end = { value: undefined, done: true as const };
  dense: Entity[];

  constructor(dense: Entity[]) {
    this.dense = dense;
  }

  [Symbol.iterator]() {
    const cursor = this.cursor ?? new StableResultCursor(this);
    this.cursor = undefined;
    return cursor.start();
  }
}

/** Unlike the pooled cursors, this cursor never escapes through the view. */
class UnpooledCursor implements IterableIterator<Entity> {
  index = 0;
  done = false;
  dense: Entity[];
  length: number;
  owner: CursorView;

  constructor(owner: CursorView) {
    this.owner = owner;
    this.dense = owner.dense;
    this.length = this.dense.length;
    owner.iterating++;
  }

  next(): IteratorResult<Entity> {
    if (this.index < this.length) return { value: this.dense[this.index++], done: false };
    return this.return();
  }

  return(): IteratorResult<Entity> {
    if (!this.done) {
      this.done = true;
      this.owner.iterating--;
    }
    return { value: undefined, done: true };
  }

  [Symbol.iterator]() {
    return this;
  }
}

class UnpooledView extends CursorView {
  override [Symbol.iterator]() {
    return new UnpooledCursor(this);
  }
}

/** No retained cursor or result, so both allocations can potentially be eliminated. */
class LocalCursorView extends CursorView {
  override [Symbol.iterator]() {
    const dense = this.dense;
    const length = dense.length;
    // oxlint-disable-next-line typescript/no-this-alias -- The iterator methods have their own receiver.
    const owner = this;
    let index = 0;
    let done = false;
    owner.iterating++;
    return {
      next(): IteratorResult<Entity> {
        if (index < length) return { value: dense[index++], done: false };
        return this.return!();
      },
      return(): IteratorResult<Entity> {
        if (!done) {
          done = true;
          owner.iterating--;
        }
        return { value: undefined, done: true };
      },
      [Symbol.iterator]() {
        return this;
      },
    } as IterableIterator<Entity>;
  }
}

class GeneratorView extends NativeView {
  iterating = 0;

  override *[Symbol.iterator]() {
    const dense = this.dense;
    const length = dense.length;
    this.iterating++;
    try {
      for (let i = 0; i < length; i++) yield dense[i];
    } finally {
      this.iterating--;
    }
  }
}

const Tag = trait();

/** Each benchmark runs in fresh processes, so iterator type feedback stays separate. */
for (const count of [32, 10_000]) {
  group(`iterator cost ${count} @iterator-cost`, () => {
    for (const mode of [
      'array',
      'array subclass',
      'decorated array',
      'native delegation',
      'copy then native',
      'pooled self result',
      'fixed done result',
      'stable result',
      'pooled record result',
      'fresh record cursor',
      'local cursor',
      'unpooled cursor',
      'generator',
      'query view',
      'query run and view',
      'sorted view',
      'relation view',
      'native query view',
      'native sorted view',
    ]) {
      const confirm = [
        'array',
        'array subclass',
        'decorated array',
        'native delegation',
        'unpooled cursor',
        'query view',
        'sorted view',
        'relation view',
        'native query view',
        'native sorted view',
      ].includes(mode);
      const results = [
        'array',
        'pooled self result',
        'fixed done result',
        'stable result',
        'query view',
      ].includes(mode);
      const sorted = ['array', 'query view', 'sorted view', 'relation view'].includes(mode);
      bench(
        `${mode}${confirm ? ' @iterator-confirm' : ''}${results ? ' @iterator-result' : ''}${sorted ? ' @iterator-sorted' : ''}`,
        function* () {
          const world = createWorld();
          const ChildOf = relation();
          const Children = ordered(ChildOf);
          const parent = world.spawn(Children);
          for (let i = 0; i < count; i++) world.spawn(Tag, ChildOf(parent));
          const ref = createQuery(Tag);
          const query = world.query(ref);
          const dense = query.toArray();
          let iterable: Iterable<Entity>;
          switch (mode) {
            case 'array':
              iterable = dense;
              break;
            case 'array subclass': {
              const array = new ArrayView();
              for (const entity of dense) array.push(entity);
              iterable = array;
              break;
            }
            case 'decorated array':
              iterable = Object.assign(dense, { context: null, binding: null, version: 0 });
              break;
            case 'native query view':
            case 'native sorted view': {
              const base = mode === 'native query view' ? query : query.sort((a, b) => a - b, [Tag]);
              // Experimental read-only path, valid only while membership and order stay fixed.
              Object.defineProperty(base, Symbol.iterator, {
                value(this: { getSource(): { dense: Entity[] } }) {
                  return this.getSource().dense[Symbol.iterator]();
                },
              });
              iterable = base;
              break;
            }
            case 'native delegation':
              iterable = new NativeView(dense);
              break;
            case 'copy then native':
              iterable = new SnapshotView(dense);
              break;
            case 'fixed done result':
              iterable = new FixedDoneView(dense);
              break;
            case 'stable result':
              iterable = new StableResultView(dense);
              break;
            case 'pooled self result':
              iterable = new CursorView(dense);
              break;
            case 'pooled record result':
              iterable = new PooledRecordView(dense);
              break;
            case 'fresh record cursor':
              iterable = new FreshRecordView(dense);
              break;
            case 'unpooled cursor':
              iterable = new UnpooledView(dense);
              break;
            case 'local cursor':
              iterable = new LocalCursorView(dense);
              break;
            case 'generator':
              iterable = new GeneratorView(dense);
              break;
            case 'sorted view':
              iterable = query.sort((a, b) => a - b, [Tag]);
              break;
            case 'relation view':
              iterable = parent.get(Children)!;
              break;
            default:
              iterable = query;
          }
          const expected = dense.reduce((sum, entity) => (sum + entity) | 0, 0);
          let sum = 0;
          // Separate callbacks keep query lookup out of the cached iteration measurements.
          const walk =
            mode === 'query run and view'
              ? () => {
                  let result = 0;
                  for (const entity of world.query(ref)) result = (result + entity) | 0;
                  sum = result;
                }
              : () => {
                  let result = 0;
                  for (const entity of iterable) result = (result + entity) | 0;
                  sum = result;
                };
          yield {
            bench: walk,
            snapshot: () => {
              assert.equal(sum, expected);
              if (
                iterable instanceof CursorView ||
                iterable instanceof StableResultView ||
                iterable instanceof GeneratorView
              ) {
                assert.equal(iterable.iterating, 0);
              }
              return count;
            },
          };
          world.destroy();
        }
      );
    }
  });
}
