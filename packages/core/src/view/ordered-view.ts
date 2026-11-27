import { assertsEnabled } from '../build-flags';
import type { Entity } from '../entity/types';
import type { QueryParameter } from '../query/types';
import { ensureTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { ensureViewBinding, matchesViewBinding } from './binding';
import { EntityView } from './entity-view';
import type {
  EntityComparator,
  EntitySource,
  IterationBuffers,
  OrderedView,
  SortKeySelector,
  ViewBinding,
  ViewScope,
} from './types';

/** Owns order independently of trait storage. Active walks retain their original sequence. */
export class OrderedSource implements EntitySource {
  dense: Entity[];
  /** Callback walks in progress. */
  iterating = 0;
  /** Open for...of iterators that read the current array. A write replaces it while nonzero. */
  readers = 0;
  views: ListView[] = [];
  dropped: Entity | undefined = undefined;
  droppedSet: Set<Entity> | undefined = undefined;

  constructor(entities: Entity[] = []) {
    this.dense = entities;
  }

  get length() {
    if (this.dropped !== undefined) this.compact();
    return this.dense.length;
  }

  /** Copy only when a walk or an iterator may still read the current array. */
  write(): Entity[] {
    if (this.dropped !== undefined) this.compact();
    if (this.iterating !== 0 || this.readers !== 0) {
      this.dense = this.dense.slice();
      this.readers = 0;
    }
    return this.dense;
  }

  /**
   * Notes an entity to leave the sequence when it is next read, so dropping many in a row
   * costs one pass. Returns false when the sequence is empty and holds nothing to drop.
   */
  drop(entity: Entity): boolean {
    if (this.dropped === undefined) {
      const dense = this.dense;
      const last = dense.length - 1;
      if (last === -1) return false;
      // A destroy cascade drops from the end. The last entity leaves at once with nothing noted,
      // unless a walk or an iterator may still read this array.
      if (dense[last] === entity && this.iterating === 0 && this.readers === 0) {
        dense.pop();
        return true;
      }
      this.dropped = entity;
    } else {
      (this.droppedSet ??= new Set([this.dropped])).add(entity);
    }
    return true;
  }

  /** Removes the noted entities. An array an active walk still reads is replaced, not edited. */
  compact(): void {
    const { droppedSet } = this;
    const dropped = this.dropped!;
    this.dropped = undefined;
    this.droppedSet = undefined;
    if (droppedSet === undefined) {
      const index = this.dense.indexOf(dropped);
      if (index === -1) return;
      if (this.iterating !== 0 || this.readers !== 0) {
        this.dense = this.dense.slice();
        this.readers = 0;
      }
      this.dense.splice(index, 1);
      return;
    }
    const entities = this.dense;
    if (this.iterating !== 0 || this.readers !== 0) {
      this.dense = entities.filter((entity) => !droppedSet.has(entity));
      this.readers = 0;
      return;
    }
    let kept = 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!droppedSet.has(entity)) entities[kept++] = entity;
    }
    entities.length = kept;
  }
}

/** The same walker serves sorted queries and the sequence held by an ordered trait. */
export class ListView extends EntityView {
  declare source: OrderedSource;
  /** What selections of this view resolve against. Null for a list no query supplies. */
  scope: ViewScope | null;

  constructor(
    ctx: WorldContext,
    source: OrderedSource,
    binding: ViewBinding,
    scope: ViewScope | null = null
  ) {
    // The sequence guards its own walks. A scoped binding keeps its buffers, any other borrows the world's.
    super(ctx, binding, source, source, scope === null ? ctx : binding);
    this.scope = scope;
  }

  override getSource(): OrderedSource {
    if (this.source.dropped !== undefined) this.source.compact();
    return this.source;
  }

  select(this: SortedView, ...params: QueryParameter[]): SortedView;
  select(...params: QueryParameter[]): ListView;
  select(...params: QueryParameter[]): ListView {
    const { ctx, source, scope } = this;
    for (const view of source.views) {
      if (matchesViewBinding(ctx, scope, params, view.binding)) return view;
    }
    // A selection shares the sequence. Only the relation owner can edit it.
    const View = source instanceof SortedSource ? SortedView : ListView;
    const view = new View(ctx, source, ensureViewBinding(ctx, scope, params), scope);
    source.views.push(view);
    return view;
  }
}

class SortedView extends ListView implements OrderedView<any> {
  declare source: SortedSource;

  get entities(): readonly Entity[] {
    return this.source.ensure();
  }

  override getSource() {
    this.source.ensure();
    return this.source;
  }

  invalidate() {
    this.source.dirty = true;
  }
}

class SortedSource extends OrderedSource {
  base: EntityView;
  /** Its version moves when the base sequence changes membership. */
  scope: ViewScope | null;
  sorter: EntityComparator | SortedKeys;
  traits: Trait[];
  instances: TraitInstance[];
  revisions: number[];
  revision = -1;
  dirty = true;
  refreshing = false;

  constructor(
    base: EntityView,
    sorter: EntityComparator | SortedKeys,
    traits: readonly Trait[],
    scope: ViewScope | null
  ) {
    super();
    this.base = base;
    this.scope = scope;
    this.sorter = sorter;
    this.traits = traits.slice();
    this.instances = this.traits.map((trait) => ensureTraitInstance(base.ctx, trait));
    this.revisions = this.traits.map(() => -1);
  }

  ensure() {
    if (this.iterating !== 0 || this.refreshing) return this.dense;
    const revision = this.scope?.version ?? 0;
    const rebuild = revision !== this.revision;
    let dirty = rebuild || this.dirty || this.instances.length === 0;
    for (let i = 0; i < this.instances.length; i++) {
      if (this.instances[i].version !== this.revisions[i]) dirty = true;
    }
    if (dirty) this.refresh(revision, rebuild);
    return this.dense;
  }

  /** Keep copying and sorting outside the cache check that traversal callers inline. */
  private refresh(revision: number, rebuild: boolean) {
    this.refreshing = true;
    try {
      // Capture before user callbacks, so writes inside them invalidate the next access.
      for (let i = 0; i < this.instances.length; i++) this.revisions[i] = this.instances[i].version;
      this.dirty = true;
      // Keep the previous sequence until sorting succeeds.
      let entities: Entity[];
      const { sorter } = this;
      if (typeof sorter !== 'function') {
        // The sorter recycles the published array as scratch, which an iterator may still read.
        entities = sorter.sort(
          rebuild ? this.base.source : this,
          this.readers !== 0 ? [] : this.dense
        );
      } else {
        if (rebuild) {
          const source = this.base.source;
          entities = source.dense.slice(0, source.length) as Entity[];
        } else {
          entities = this.dense.slice();
        }
        entities.sort(sorter);
      }
      this.dense = entities;
      this.readers = 0;
      this.revision = revision;
      this.dirty = false;
    } finally {
      this.refreshing = false;
    }
  }
}

/** Reuses sort buffers while keeping the published order separate until refresh succeeds. */
class SortedKeys implements EntitySource {
  /** Key reads keep their projection prepared independently of the sorted view's walks. */
  iterationBuffers: IterationBuffers | undefined;
  dense: Entity[] = [];
  private output: Entity[] = [];
  values: number[] = [];
  scratch: number[] = [];
  runs: number[] = [];
  reader: EntityView;
  collect: (value: any, entity: Entity, index: number) => void;

  constructor(base: EntityView, trait: Trait, selector: SortKeySelector, scope: ViewScope | null) {
    // The reader walks this object's own array and keeps its buffers here.
    this.reader = new EntityView(
      base.ctx,
      ensureViewBinding(base.ctx, scope, [trait]),
      this,
      null,
      this
    );
    this.collect = (value, _entity, index) => {
      const key = selector(value);
      if (assertsEnabled && (typeof key !== 'number' || Number.isNaN(key))) {
        throw new Error('Koota: [SORT_KEY] A sortBy selector must return a number other than NaN.');
      }
      this.values[index] = key;
    };
  }

  get length() {
    return this.dense.length;
  }

  /** Returns the next order without modifying published, which becomes scratch only on success. */
  sort(source: EntitySource, published: Entity[]): Entity[] {
    const entities = this.dense;
    const { dense, length: count } = source;
    for (let i = 0; i < count; i++) entities[i] = dense[i] as Entity;
    while (entities.length > count) entities.pop();
    // Read-only traversal neither writes trait data nor invalidates the dependency version.
    this.reader.read(this.collect);
    const result = sortKeys(this.values, entities, this.scratch, this.output, this.runs, count);
    while (result.length > count) result.pop();
    // Retain the unused buffer and recycle published for the next refresh.
    if (result === entities) this.dense = this.output;
    this.output = published;
    return result;
  }
}

const sortedViews = new WeakMap<EntityView, WeakMap<EntityComparator, SortedView[]>>();
export const keyedViews = new WeakMap<
  EntityView,
  WeakMap<Trait, WeakMap<SortKeySelector, SortedView>>
>();

/** Cached by source view, key trait and selector identity. @inline */
export function sortByView<C extends Trait>(
  base: EntityView,
  trait: C,
  selector: SortKeySelector<C>,
  scope: ViewScope | null
): OrderedView<any> {
  return (
    keyedViews.get(base)?.get(trait)?.get(selector) ?? createKeyedView(base, trait, selector, scope)
  );
}

/** Keep first-use setup outside the repeated cache lookup's inlining budget. */
export function createKeyedView<C extends Trait>(
  base: EntityView,
  trait: C,
  selector: SortKeySelector<C>,
  scope: ViewScope | null
): OrderedView<any> {
  let cache = keyedViews.get(base);
  if (!cache) keyedViews.set(base, (cache = new WeakMap()));
  let views = cache.get(trait);
  if (!views) cache.set(trait, (views = new WeakMap()));
  const source = new SortedSource(base, new SortedKeys(base, trait, selector, scope), [trait], scope);
  const view = new SortedView(base.ctx, source, base.binding, scope);
  source.views.push(view);
  views.set(selector, view);
  return view;
}

/** Cached by source view, comparator identity and dependency traits. */
export function sortView(
  base: EntityView,
  compare: EntityComparator,
  traits: readonly Trait[],
  scope: ViewScope | null
): OrderedView<any> {
  let cache = sortedViews.get(base);
  if (!cache) sortedViews.set(base, (cache = new WeakMap()));
  let views = cache.get(compare);
  if (!views) cache.set(compare, (views = []));
  for (const view of views) {
    const source = view.source;
    if (
      source.traits.length === traits.length &&
      source.traits.every((trait, i) => trait === traits[i])
    )
      return view;
  }
  const view = new SortedView(
    base.ctx,
    new SortedSource(base, compare, traits, scope),
    base.binding,
    scope
  );
  view.source.views.push(view);
  views.push(view);
  return view;
}

/**
 * Stably sorts the first length key/entity pairs, using distinct scratch arrays.
 * Keys must be numbers other than NaN. Returns either entity array with its sorted prefix.
 */
function sortKeys(
  keys: number[],
  entities: Entity[],
  scratchKeys: number[],
  scratchEntities: Entity[],
  runs: number[],
  length: number
): Entity[] {
  let count = 0;
  let start = 0;
  while (start < length) {
    runs[count++] = start;
    let end = start + 1;
    if (end < length && keys[end] < keys[start]) {
      while (end < length && keys[end] < keys[end - 1]) end++;
      // Strict descent keeps equal keys in their input order when a run is reversed.
      for (let left = start, right = end - 1; left < right; left++, right--) {
        const key = keys[left];
        const entity = entities[left];
        keys[left] = keys[right];
        entities[left] = entities[right];
        keys[right] = key;
        entities[right] = entity;
      }
    } else {
      while (end < length && keys[end] >= keys[end - 1]) end++;
    }

    // Short insertion runs bound the shifts before linear merging takes over.
    const limit = Math.min(start + 8, length);
    for (; end < limit; end++) {
      const key = keys[end];
      const entity = entities[end];
      let left = start;
      let right = end;
      while (left < right) {
        const middle = (left + right) >>> 1;
        if (key < keys[middle]) right = middle;
        else left = middle + 1;
      }
      for (let i = end; i > left; i--) {
        keys[i] = keys[i - 1];
        entities[i] = entities[i - 1];
      }
      keys[left] = key;
      entities[left] = entity;
    }
    start = end;
  }
  runs[count] = length;

  while (count > 1) {
    let next = 0;
    for (let run = 0; run < count; run += 2) {
      const start = runs[run];
      const middle = runs[run + 1];
      const end = run + 1 < count ? runs[run + 2] : middle;
      runs[next++] = start;
      let left = start;
      let right = middle;
      let output = start;
      if (left < middle && right < end) {
        let leftKey = keys[left];
        let rightKey = keys[right];
        while (true) {
          if (leftKey <= rightKey) {
            scratchKeys[output] = leftKey;
            scratchEntities[output++] = entities[left++];
            if (left === middle) break;
            leftKey = keys[left];
          } else {
            scratchKeys[output] = rightKey;
            scratchEntities[output++] = entities[right++];
            if (right === end) break;
            rightKey = keys[right];
          }
        }
      }
      while (left < middle) {
        scratchKeys[output] = keys[left];
        scratchEntities[output++] = entities[left++];
      }
      while (right < end) {
        scratchKeys[output] = keys[right];
        scratchEntities[output++] = entities[right++];
      }
    }
    runs[next] = length;
    count = next;
    const previousKeys = keys;
    keys = scratchKeys;
    scratchKeys = previousKeys;
    const previousEntities = entities;
    entities = scratchEntities;
    scratchEntities = previousEntities;
  }
  return entities;
}
