import type { Entity } from '../entity/types';
import { assertsEnabled } from '../assert-config';
import { ensureTraitInstance } from '../query/query';
import type {
  QueryInstance,
  QueryIterationBuffers,
  QueryParameter,
  QueryViewBinding,
} from '../query/types';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import { sameParams } from '../query/utils/same-params';
import { EntityView, getQueryBinding, matchesQueryBinding, type EntitySource } from './entity-view';
import type { EntityComparator, OrderedView, SortKeySelector } from './types';
import { sortKeys } from './sort-keys';

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

  constructor(
    ctx: WorldContext,
    source: OrderedSource,
    binding: QueryViewBinding,
    query: QueryInstance | null = null
  ) {
    super(ctx, query, binding, source, false);
  }

  override getGuard() {
    return this.source;
  }

  override getSource(): OrderedSource {
    if (this.source.dropped !== undefined) this.source.compact();
    return this.source;
  }

  select(this: SortedView, ...params: QueryParameter[]): SortedView;
  select(...params: QueryParameter[]): ListView;
  select(...params: QueryParameter[]): ListView {
    const { ctx, source, query } = this;
    for (const view of source.views) {
      if (
        sameParams(view.binding.params, params) ||
        matchesQueryBinding(ctx, query, params, view.binding)
      )
        return view;
    }
    // A selection shares the sequence. Only the relation owner can edit it.
    const View = source instanceof SortedSource ? SortedView : ListView;
    const view = new View(ctx, source, getQueryBinding(ctx, query, params), query);
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
  sorter: EntityComparator | SortedKeys;
  traits: Trait[];
  instances: TraitInstance[];
  revisions: number[];
  revision = -1;
  dirty = true;
  refreshing = false;

  constructor(base: EntityView, sorter: EntityComparator | SortedKeys, traits: readonly Trait[]) {
    super();
    this.base = base;
    this.sorter = sorter;
    this.traits = traits.slice();
    this.instances = this.traits.map((trait) => ensureTraitInstance(base.ctx, trait));
    this.revisions = this.traits.map(() => -1);
  }

  ensure() {
    if (this.iterating !== 0 || this.refreshing) return this.dense;
    const { base } = this;
    const liveQuery = base.live ? base.query : null;
    const revision = liveQuery?.version ?? 0;
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
  iterationBuffers: QueryIterationBuffers | undefined;
  dense: Entity[] = [];
  private output: Entity[] = [];
  values: number[] = [];
  scratch: number[] = [];
  runs: number[] = [];
  reader: EntityView;
  collect: (state: any[], entity: Entity, index: number) => void;

  constructor(base: EntityView, trait: Trait, selector: SortKeySelector) {
    this.reader = new EntityView(
      base.ctx,
      base.query,
      getQueryBinding(base.ctx, base.query, [trait]),
      this,
      false
    );
    this.collect = (state, _entity, index) => {
      const key = selector(state[0]);
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
    this.reader.read(this.collect, this);
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
  selector: SortKeySelector<C>
): OrderedView<any> {
  return keyedViews.get(base)?.get(trait)?.get(selector) ?? createKeyedView(base, trait, selector);
}

/** Keep first-use setup outside the repeated cache lookup's inlining budget. */
export function createKeyedView<C extends Trait>(
  base: EntityView,
  trait: C,
  selector: SortKeySelector<C>
): OrderedView<any> {
  let cache = keyedViews.get(base);
  if (!cache) keyedViews.set(base, (cache = new WeakMap()));
  let views = cache.get(trait);
  if (!views) cache.set(trait, (views = new WeakMap()));
  const source = new SortedSource(base, new SortedKeys(base, trait, selector), [trait]);
  const view = new SortedView(base.ctx, source, base.binding, base.query);
  source.views.push(view);
  views.set(selector, view);
  return view;
}

/** Cached by source view, comparator identity and dependency traits. */
export function sortView(
  base: EntityView,
  compare: EntityComparator,
  traits: readonly Trait[]
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
    new SortedSource(base, compare, traits),
    base.binding,
    base.query
  );
  view.source.views.push(view);
  views.push(view);
  return view;
}
