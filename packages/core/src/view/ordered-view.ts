import type { Entity } from '../entity/types';
import { commitQueryRemovals } from '../query/query';
import type { QueryInstance, QueryParameter, QueryViewBinding } from '../query/types';
import { registerTrait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import {
  EntityView,
  getQueryBinding,
  matchesQueryBinding,
  sameParams,
  type EntitySource,
} from './entity-view';
import type { EntityComparator, OrderedView } from './types';

/** Owns order independently of trait storage. Active walks retain their original sequence. */
export class OrderedSource implements EntitySource {
  dense: Entity[];
  iterating = 0;
  views: ListView[] = [];

  constructor(entities: Entity[] = []) {
    this.dense = entities;
  }

  get length() {
    return this.dense.length;
  }

  /** Copy only when an active walk still reads the current array. */
  write(): Entity[] {
    if (this.iterating !== 0) this.dense = this.dense.slice();
    return this.dense;
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

  select(this: SortedView, ...params: QueryParameter[]): SortedView;
  select(...params: QueryParameter[]): ListView;
  select(...params: QueryParameter[]): ListView {
    const { ctx, source, query } = this;
    for (const view of source.views) {
      if (sameParams(view.binding.params, params) || matchesQueryBinding(ctx, params, view.binding))
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

  override getSource() {
    this.source.ensure();
    return this.source;
  }

  invalidate() {
    this.source.dirty = true;
  }

  /** A small entry lets V8 inline native array iteration into the caller. */
  override [Symbol.iterator](): IterableIterator<Entity> {
    return this.source.ensure().values();
  }
}

class SortedSource extends OrderedSource {
  base: EntityView;
  compare: EntityComparator;
  traits: Trait[];
  instances: TraitInstance[];
  revisions: number[];
  revision = -1;
  dirty = true;
  refreshing = false;

  constructor(base: EntityView, compare: EntityComparator, traits: readonly Trait[]) {
    super();
    this.base = base;
    this.compare = compare;
    this.traits = traits.slice();
    this.instances = this.traits.map((trait) => {
      if (!getTraitInstance(base.ctx.traitInstances, trait)) registerTrait(base.ctx, trait);
      return getTraitInstance(base.ctx.traitInstances, trait)!;
    });
    this.revisions = this.traits.map(() => -1);
  }

  ensure() {
    if (this.iterating !== 0 || this.refreshing) return this.dense;
    const { base } = this;
    const liveQuery = base.live ? base.query : null;
    if (liveQuery && base.ctx.dirtyQueries.size !== 0) commitQueryRemovals(base.ctx);
    const revision = liveQuery?.version ?? 0;
    const rebuild = revision !== this.revision;
    let dirty = rebuild || this.dirty || this.instances.length === 0;
    for (let i = 0; i < this.instances.length; i++) {
      if (this.instances[i].version !== this.revisions[i]) dirty = true;
    }
    if (dirty) this.refresh(revision, rebuild, liveQuery);
    return this.dense;
  }

  /** Keep copying and sorting outside the cache check that traversal callers inline. */
  private refresh(revision: number, rebuild: boolean, liveQuery: QueryInstance | null) {
    this.refreshing = true;
    try {
      // Published arrays stay immutable so native iterators retain their starting sequence.
      const entities: Entity[] = rebuild ? [] : this.dense.slice();
      if (rebuild) {
        const source = this.base.source;
        const pending = liveQuery?.toRemove;
        for (let i = 0; i < source.length; i++) {
          const entity = source.dense[i] as Entity;
          if (!pending?.has(entity)) entities.push(entity);
        }
      }
      // Capture before the comparator, so writes inside it invalidate the next access.
      for (let i = 0; i < this.instances.length; i++) this.revisions[i] = this.instances[i].version;
      this.dirty = true;
      entities.sort(this.compare);
      this.dense = entities;
      this.revision = revision;
      this.dirty = false;
    } finally {
      this.refreshing = false;
    }
  }
}

const sortedViews = new WeakMap<EntityView, WeakMap<EntityComparator, SortedView[]>>();

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
