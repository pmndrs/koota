import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { isIdentifierPair } from '../identifier/identifier';
import { getRootIdentifierOwners } from '../identifier/ownership';
import { $internal } from '../internal';
import { isRelationPair } from '../relation/relation';
import { getRelationSources } from '../relation/targets';
import type { Relation } from '../relation/types';
import { hasTraitMembership } from '../trait/membership';
import type { Trait } from '../trait/types';
import { ensureViewBinding } from '../view/binding';
import { EntityView } from '../view/entity-view';
import { sortByView, sortView } from '../view/ordered-view';
import type {
  EntityComparator,
  EntitySource,
  IterationBufferPool,
  SortKeySelector,
  ViewBinding,
  WalkGuard,
} from '../view/types';
import type { World, WorldContext } from '../world/types';
import { getQueryPages } from './layout';
import { isQuery } from './query';
import {
  ensureInlineQuery,
  ensureQueryInstance,
  findInlineQuery,
  rememberInlineQuery,
} from './registry';
import { IsExcluded } from './terms';
import { consumeTrackingBatch } from './tracking';
import type { Query, QueryInstance, QueryParameter, QueryView } from './types';

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- Fields initialize below and traversal methods come from EntityView.prototype.
interface View extends EntityView {}

class View implements QueryView<any> {
  ctx: WorldContext;
  binding: ViewBinding;
  source: EntitySource;
  guard: WalkGuard;
  pool: IterationBufferPool;
  query: QueryInstance;

  /** The query supplies the sequence, guards walks of it and scopes every selection. */
  constructor(ctx: WorldContext, query: QueryInstance, binding: ViewBinding) {
    this.ctx = ctx;
    this.binding = binding;
    this.source = query.exposed;
    this.guard = query;
    this.pool = binding;
    this.query = query;
  }

  get length() {
    return this.source.length;
  }

  get entities(): readonly Entity[] {
    const source = this.source;
    const dense = source.dense as Entity[];
    // Retired slots are outside the query's current membership.
    if (dense.length !== source.length) dense.length = source.length;
    return dense;
  }

  sort(compare: EntityComparator, deps: readonly Trait[] = []) {
    return sortView(this, compare, deps, this.query);
  }

  sortBy<C extends Trait>(trait: C, selector: SortKeySelector<C>) {
    return sortByView(this, trait, selector, this.query);
  }

  getPages() {
    return getQueryPages(this.query, this.source, this.binding);
  }

  /** Views are cached per binding on the query, so selecting every frame allocates nothing. */
  select<U extends QueryParameter[]>(...params: U): QueryView<U> {
    const binding = ensureViewBinding(this.ctx, this.query, params);
    if (binding === this.binding) return this as unknown as QueryView<U>;
    return ensureLiveView(this.ctx, this.query, binding) as unknown as QueryView<U>;
  }
}

// Share traversal methods without a second constructor on the query allocation path.
Object.setPrototypeOf(View.prototype, EntityView.prototype);

/** Creates the view a query exposes for a binding. Live views follow the exposed set on each run. */
function ensureLiveView(ctx: WorldContext, query: QueryInstance, binding: ViewBinding) {
  let view = binding.view as View | null;
  if (view === null) {
    view = new View(ctx, query, binding);
    binding.view = view;
  }
  return view;
}

/** Resolves the live view for this run's parameters. */
export function bindQueryView(
  ctx: WorldContext,
  query: QueryInstance,
  params: QueryParameter[]
): QueryView<any> {
  const binding = query.viewBindings[0];
  if (binding !== undefined && binding.params === params && binding.view !== null) {
    return binding.view as View;
  }
  return ensureLiveView(ctx, query, ensureViewBinding(ctx, query, params));
}

function runQueryInstance<T extends QueryParameter[]>(
  ctx: WorldContext,
  query: QueryInstance<T>,
  params: QueryParameter[]
): QueryView<T> {
  if (query.isTracking) consumeTrackingBatch(query);
  return bindQueryView(ctx, query, params) as QueryView<T>;
}

function runQueryFirst(query: QueryInstance): Entity | undefined {
  // Reading one entity still consumes the entire tracking batch.
  if (query.isTracking) consumeTrackingBatch(query);
  const { dense, length } = query.exposed;
  return length !== 0 ? (dense[0] as Entity) : undefined;
}

/** Run a reusable query with its declared projection order. */
export function runQuery<T extends QueryParameter[]>(
  ctx: WorldContext,
  query: Query<T>
): QueryView<T> {
  const instance = ctx.queryInstances[query.id] ?? ensureQueryInstance(ctx, query);
  return runQueryInstance(ctx, instance, query.parameters) as QueryView<T>;
}

/** Inline and compiled queries share the live view for their membership and projection. */
function runInlineQuery(ctx: WorldContext, params: QueryParameter[]) {
  const node = findInlineQuery(ctx, params);
  if (node !== null) return runQueryInstance(ctx, node.query!, node.params!);

  const query = ensureInlineQuery(ctx, params);
  rememberInlineQuery(ctx, params, query);
  return runQueryInstance(ctx, query, params);
}

export function query(this: World, ...args: any[]) {
  const ctx = this[$internal];
  if (args.length === 1 && isQuery(args[0])) return runQuery(ctx, args[0]);
  return runInlineQuery(ctx, args);
}

export function queryFirst(this: World, ...args: [Query<QueryParameter[]>] | QueryParameter[]) {
  const ctx = this[$internal];
  if (args.length === 1) {
    const arg = args[0];
    if (isQuery(arg)) return runQueryFirst(ensureQueryInstance(ctx, arg));
    if (isRelationPair(arg) && typeof arg.target === 'number') {
      const id = getEntityId(arg.target);
      // An existing query may have reordered its members as sources entered or left.
      if (!ctx.targetQueries[id >>> 10]?.[id & 1023]?.length) {
        return getFirstRelationSource(ctx, arg.relation as Relation<Trait>, arg.target);
      }
    }
  }

  const node = findInlineQuery(ctx, args as QueryParameter[]);
  if (node !== null) return runQueryFirst(node.query!);

  const identified = findIdentifiedEntity(ctx, args as QueryParameter[]);
  if (identified !== null) return identified;

  const query = ensureInlineQuery(ctx, args as QueryParameter[]);
  rememberInlineQuery(ctx, args as QueryParameter[], query);
  return runQueryFirst(query);
}

/**
 * An entity is a match, undefined is a known miss, and null delegates to the query engine.
 * Keys stored with one owner combined with trait or identifier presence use this path.
 */
export function findIdentifiedEntity(
  ctx: WorldContext,
  params: QueryParameter[]
): Entity | undefined | null {
  let entity: Entity | undefined;
  let matches = true;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (typeof param === 'function') continue;
    if (!isIdentifierPair(param) || param.identifier[$internal].scope !== undefined) return null;
    const owner = getRootIdentifierOwners(ctx, param);
    if (typeof owner === 'object') return null;
    // Inspect every term even after a miss so tracking modifiers still initialize their query.
    if (owner === undefined || (entity !== undefined && entity !== owner)) matches = false;
    entity = owner;
  }
  if (!matches) return;
  if (entity === undefined) return null;
  if (hasTraitMembership(ctx, entity, IsExcluded)) return;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    // Identifiers share their backing trait's id, which is all the membership check needs.
    if (typeof param === 'function' && !hasTraitMembership(ctx, entity, param as Trait)) return;
  }
  return entity;
}

/** A one-off first match can stop at the first visible source in the query's seed order. */
export function getFirstRelationSource(ctx: WorldContext, relation: Relation<Trait>, target: Entity) {
  const bucket = getRelationSources(ctx, relation, target);
  for (let i = 0; i < bucket.length; i++) {
    if (!hasTraitMembership(ctx, bucket[i], IsExcluded)) return bucket[i];
  }
}
