import { $internal } from '../common';
import { isIdentifier, isIdentifierPair } from '../identifier/identifier';
import type { SparseSet } from '@koota/collections';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isRelationPair } from '../relation/utils/is-relation';
import type { RelationPair } from '../relation/types';
import type { Store } from '../storage';
import { createQuery, ensureTraitInstance } from '../query/query';
import { registerTrait } from '../trait/trait';
import type { Trait, TraitInstance } from '../trait/types';
import { hasSubscribers } from '../trait/subscriptions';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import { beginDefer, endDefer } from '../world/defer';
import { isModifier } from '../query/modifier';
import { isQuery } from '../query/utils/is-query';
import { sameParams } from '../query/utils/same-params';
import { notifyChanged } from '../query/modifiers/changed';
import {
  compileQueryIterators,
  createIterationCursor,
  getQueryIterators,
} from '../query/utils/compile-iterators';
import type {
  QueryInstance,
  QueryIterationBuffers,
  QueryLayout,
  QueryParameter,
  QueryViewBinding,
  TargetProjection,
  UpdateEachOptions,
} from '../query/types';

/** The live prefix of an entity sequence. Storage stays indexed by entity id. */
export type EntitySource = {
  readonly dense: readonly number[];
  readonly length: number;
};

type Callback = (...args: any[]) => void;
type IterationBufferPool = { iterationBuffers: QueryIterationBuffers | undefined };

/**
 * Shared traversal over entity sequences. Every walk opens a defer scope, so structural changes
 * made by callbacks apply when the outermost walk ends and no row loses its data under it.
 * Ordered sources retain the arrays read by active walks. toArray returns a plain array the
 * caller owns.
 */
export class EntityView {
  ctx: WorldContext;
  /** Null for lookups that bypass a query instance, such as identifier and relation fast paths. */
  query: QueryInstance | null;
  binding: QueryViewBinding;
  source: EntitySource;
  live: boolean;
  /** Owned query views memoize their page layout. */
  layout: QueryLayout | undefined;

  constructor(
    ctx: WorldContext,
    query: QueryInstance | null,
    binding: QueryViewBinding,
    source: EntitySource,
    live: boolean
  ) {
    this.ctx = ctx;
    this.query = query;
    this.binding = binding;
    this.source = source;
    this.live = live;
    this.layout = undefined;
  }

  getGuard(): { iterating: number } | null {
    return this.live ? this.query : null;
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

  [Symbol.iterator](): IterableIterator<Entity> {
    const source = this.getSource();
    const dense = source.dense as Entity[];
    // Trim retired slots so V8 can share the loop bound with the array access.
    if (dense.length !== source.length) dense.length = source.length;
    const guard = this.getGuard();
    if (guard) guard.iterating++;
    beginDefer(this.ctx);
    return {
      index: 0,
      length: dense.length,
      dense,
      guard,
      ctx: this.ctx,
      done: false,
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
    const guard = this.getGuard();
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

  readEach(callback: Callback, pool: IterationBufferPool = this.query ?? this.ctx) {
    const { dense, length } = this.getSource();
    if (length === 0) return this;
    const { ctx, query } = this;
    const guard = this.getGuard();
    const { stores } = this.binding;
    const buffers = takeIterationBuffers(ctx, pool, dense as Entity[], this.binding, query);
    if (guard) guard.iterating++;
    beginDefer(ctx);
    try {
      buffers.iterators!.readEach(ctx, dense as Entity[], length, callback, buffers, stores);
    } finally {
      if (guard) guard.iterating--;
      releaseIterationBuffers(pool, buffers);
      endDefer(ctx);
    }
    return this;
  }

  updateEach(callback: Callback, options?: UpdateEachOptions) {
    return this.walk(callback, options, false);
  }

  each(callback: Callback) {
    return this.walk(callback, undefined, true);
  }

  /**
   * Shared body of updateEach and each. This call boundary leaves V8 room to inline the
   * generated iterator and trait accessors together.
   */
  walk(callback: Callback, options: UpdateEachOptions | undefined, positional: boolean) {
    const { dense, length } = this.getSource();
    if (length === 0) return this;
    const { ctx, query } = this;
    const guard = this.getGuard();
    const { traits, stores } = this.binding;
    const pool = query ?? ctx;
    const entities = dense as Entity[];
    const buffers = takeIterationBuffers(ctx, pool, entities, this.binding, query);
    const iterators = buffers.iterators!;
    if (guard) guard.iterating++;
    beginDefer(ctx);
    try {
      if (trackTraits(ctx, traits, buffers.modes, options?.changeDetection) === 0) {
        (positional ? iterators.each : iterators.updateEach)(
          ctx,
          entities,
          length,
          callback,
          buffers,
          stores
        );
      } else /* @cold */ {
        const changedCount = (positional ? iterators.trackArgs : iterators.trackEach)(
          ctx,
          entities,
          length,
          callback,
          buffers,
          stores
        );
        const { changedEntities, changedTraits } = buffers;
        for (let i = 0; i < changedCount; i++) {
          notifyChanged(ctx, changedEntities[i], changedTraits[i]);
        }
      }
    } finally {
      if (guard) guard.iterating--;
      // A nested read may cache an order before the walk's last write.
      for (let i = 0; i < traits.length; i++) {
        const instance = getTraitInstance(ctx.traitInstances, traits[i]);
        if (instance) instance.version++;
      }
      releaseIterationBuffers(pool, buffers);
      // Changes are reported before the deferred structural changes apply.
      endDefer(ctx);
    }
    return this;
  }
}

/** Walks the membership present when the loop started. */
interface ViewIterator extends IterableIterator<Entity> {
  index: number;
  done: boolean;
  readonly length: number;
  readonly dense: readonly number[];
  readonly guard: { iterating: number } | null;
  readonly ctx: WorldContext;
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
  // A local result lets V8 eliminate it independently of the cursor.
  return { value, done };
}

function returnViewIterator(this: ViewIterator): IteratorResult<Entity> {
  finishViewIterator(this);
  return { value: 0 as Entity, done: true };
}

function iterateViewIterator(this: ViewIterator) {
  return this;
}

/* @inline */ function finishViewIterator(iterator: ViewIterator) {
  if (!iterator.done) {
    iterator.done = true;
    iterator.index = iterator.length;
    endViewIteration(iterator.ctx, iterator.guard);
  }
}

/** Keep scope cleanup outside the per-entity next method's inlining budget. */
function endViewIteration(ctx: WorldContext, guard: ViewIterator['guard']) {
  if (guard) guard.iterating--;
  endDefer(ctx);
}

/** Handle-only snapshots need no world-specific stores or query-owned view cache. */
const entityBinding: QueryViewBinding = {
  params: [],
  traits: [],
  stores: [],
  projection: [],
  targets: [],
  view: null,
  iterators: null,
};

/**
 * Finds or builds the trait and store lists for a parameter list. Bindings are cached on the query
 * and never mutated, so views share them and select swaps references. A query ref passes the
 * same parameters array every run, so identity settles the common case before any walk. The cache
 * holds one binding per distinct projection, which stays small since selections are static code.
 */
export function getQueryBinding(
  ctx: WorldContext,
  query: QueryInstance | null,
  params: QueryParameter[]
): QueryViewBinding {
  if (
    query === null &&
    (params.length === 0 ||
      (params.length === 1 &&
        (isIdentifierPair(params[0]) ||
          (isRelationPair(params[0]) && typeof params[0].target === 'number'))))
  ) {
    return entityBinding;
  }
  const cache = query?.viewBindings;
  if (cache) {
    for (let i = 0; i < cache.length; i++) {
      const binding = cache[i];
      if (sameParams(binding.params, params) || matchesQueryBinding(ctx, query, params, binding))
        return binding;
    }
  }
  const binding: QueryViewBinding = {
    params,
    traits: [],
    stores: [],
    projection: [],
    targets: [],
    view: null,
    iterators: null,
  };
  fillQueryBinding(ctx, query, params, binding);
  if (cache) cache.push(binding);
  return binding;
}

/** Mirrors fillQueryBinding, comparing each stored trait and its current store in order. */
export function matchesQueryBinding(
  ctx: WorldContext,
  query: QueryInstance | null,
  params: QueryParameter[],
  { stores, projection, targets }: QueryViewBinding
): boolean {
  let index = 0;
  let argument = 0;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isIdentifierPair(param) || isIdentifier(param)) continue;
    if (isRelationPair(param)) {
      if (typeof param.target === 'number') continue;
      if (!matchesPairProjection(ctx, query, param, projection[argument], targets[argument])) {
        return false;
      }
      argument++;
      continue;
    }
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (let j = 0; j < param.traits.length; j++) {
        const trait = param.traits[j];
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        if (
          projection[argument++] !== trait ||
          getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
        )
          return false;
        index++;
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      if (
        projection[argument++] !== trait ||
        getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
      )
        return false;
      index++;
    }
  }
  return argument === projection.length;
}

/** Collects the stored traits of a parameter list in order, registering any that are new. */
function fillQueryBinding(
  ctx: WorldContext,
  query: QueryInstance | null,
  params: QueryParameter[],
  binding: QueryViewBinding
) {
  const { traits, stores, projection, targets } = binding;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isIdentifierPair(param) || isIdentifier(param)) continue;
    if (isRelationPair(param)) {
      if (typeof param.target === 'number') continue;
      bindPairProjection(ctx, query, param, binding);
      continue;
    }
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (let j = 0; j < param.traits.length; j++) {
        const trait = param.traits[j];
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        traits.push(trait);
        projection.push(trait);
        targets.push(undefined);
        stores.push(getQueryStore(ctx, trait));
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      traits.push(trait);
      projection.push(trait);
      targets.push(undefined);
      stores.push(getQueryStore(ctx, trait));
    }
  }
}

/** Registers relation storage and resolves its target query once when a binding is created. */
export function bindPairProjection(
  ctx: WorldContext,
  query: QueryInstance | null,
  pair: RelationPair,
  binding: QueryViewBinding
) {
  const instance = ensureTraitInstance(ctx, pair.relation[$internal].trait);
  const exclusive = pair.relation[$internal].exclusive;
  const matches =
    !exclusive && pair.targetQuery !== undefined ? findTargetQueryMatches(query, pair) : undefined;
  binding.projection.push(
    targetProjection(instance, exclusive ? 'slot' : matches === undefined ? 'copy' : 'filter')
  );
  binding.targets.push(matches);
}

const targetProjections = new WeakMap<
  TraitInstance,
  Partial<Record<TargetProjection['mode'], TargetProjection>>
>();

/** One interned entry per instance and mode, so bindings and iterator caches compare identity. */
function targetProjection(instance: TraitInstance, mode: TargetProjection['mode']): TargetProjection {
  let modes = targetProjections.get(instance);
  if (modes === undefined) targetProjections.set(instance, (modes = {}));
  return (modes[mode] ??= { instance, mode });
}

/** A pair matches a stored projection by relation instance, read mode and target query match set. */
function matchesPairProjection(
  ctx: WorldContext,
  query: QueryInstance | null,
  pair: RelationPair,
  entry: Trait | TargetProjection | undefined,
  target: SparseSet | undefined
): boolean {
  if (entry === undefined || typeof entry === 'function') return false;
  const instance = getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait);
  if (instance !== entry.instance) return false;
  const exclusive = pair.relation[$internal].exclusive;
  const matches =
    !exclusive && pair.targetQuery !== undefined ? findTargetQueryMatches(query, pair) : undefined;
  return (
    entry.mode === (exclusive ? 'slot' : matches === undefined ? 'copy' : 'filter') &&
    matches === target
  );
}

/**
 * The match set of the query's own filter for this pair, kept current by the target query.
 * Target queries are compared by identity or entry by entry first, and hashed only when
 * that fails, so a cached binding lookup does not pay for a hash.
 */
function findTargetQueryMatches(
  query: QueryInstance | null,
  pair: RelationPair
): SparseSet | undefined {
  const pairs = query?.filters?.pairs;
  if (pairs === undefined) return undefined;
  const targetQuery = pair.targetQuery!;
  for (let i = 0; i < pairs.length; i++) {
    const filter = pairs[i];
    if (filter.relation !== pair.relation || filter.targetQuery === undefined) continue;
    if (
      filter.targetQuery === targetQuery ||
      (!isQuery(targetQuery) &&
        !isQuery(filter.targetQuery) &&
        sameParams(filter.targetQuery, targetQuery))
    ) {
      return filter.targetQueryMatches;
    }
  }
  const ref = isQuery(targetQuery) ? targetQuery : createQuery(...targetQuery);
  for (let i = 0; i < pairs.length; i++) {
    const filter = pairs[i];
    if (filter.relation === pair.relation && filter.targetQueryRef === ref) {
      return filter.targetQueryMatches;
    }
  }
  return undefined;
}

function createIterationBuffers(): QueryIterationBuffers {
  return {
    state: [],
    binding: undefined,
    records: [],
    targetSnapshots: [],
    iterators: undefined,
    modes: [],
    atomicSnapshots: [],
    changedEntities: [],
    changedTraits: [],
    next: undefined,
  };
}

/** Checks out buffers from the pool, preparing them when the projection differs. */
function takeIterationBuffers(
  ctx: WorldContext,
  pool: IterationBufferPool,
  entities: Entity[],
  binding: QueryViewBinding,
  query: QueryInstance | null
): QueryIterationBuffers {
  const buffers = pool.iterationBuffers ?? createIterationBuffers();
  pool.iterationBuffers = buffers.next;
  if (buffers.binding !== binding) {
    prepareIterationBuffers(ctx, buffers, entities, binding, query);
  }
  return buffers;
}

/**
 * Prepares buffers for a projection. Records already built for the same trait are kept. A
 * query binding compiles its own iterators, since every generated function with the same source
 * would otherwise share one feedback vector and its callback site would turn megamorphic across
 * queries. Views without a query share iterators per projection.
 */
function prepareIterationBuffers(
  ctx: WorldContext,
  buffers: QueryIterationBuffers,
  entities: Entity[],
  binding: QueryViewBinding,
  query: QueryInstance | null
) {
  const { traits, stores, projection } = binding;
  const { state, records } = buffers;
  const prepared = buffers.binding?.traits;
  if (buffers.iterators !== undefined && sameParams(buffers.binding!.projection, projection)) {
    buffers.binding = binding;
    return;
  }
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    state[i] = undefined;
    if (prepared?.[i] === trait) continue;
    const traitCtx = trait[$internal];
    records[i] = traitCtx.cursor
      ? {
          value: createIterationCursor(trait, 'write'),
          tuples: undefined,
          plain: createIterationCursor(trait, 'plain'),
          reader: createIterationCursor(trait, 'read'),
        }
      : traitCtx.type === 'soa'
        ? createIterationRecord(ctx, getEntityId(entities[0]), trait, stores[i])
        : undefined;
  }
  state.length = records.length = traits.length;
  for (let i = 0; i < projection.length; i++) {
    const part = projection[i];
    if (typeof part !== 'function' && (part.mode === 'copy' || part.mode === 'filter')) {
      buffers.targetSnapshots[i] ??= [];
    }
  }
  buffers.binding = binding;
  buffers.iterators =
    query === null
      ? getQueryIterators(traits, projection)
      : (binding.iterators ??= compileQueryIterators(traits, projection));
}

/** Releases references to user objects, then returns the buffers to the pool. */
function releaseIterationBuffers(pool: IterationBufferPool, buffers: QueryIterationBuffers) {
  buffers.iterators!.release(buffers);
  const snapshots = buffers.atomicSnapshots;
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
  buffers.next = pool.iterationBuffers;
  pool.iterationBuffers = buffers;
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

/** A Changed query anywhere in the world reads the writes a walk makes to the trait. */
function hasChangedQuery(instance: TraitInstance) {
  const { trackingQueries, generationId, bitflag } = instance;
  for (let i = 0; i < trackingQueries.length; i++) {
    if ((trackingQueries[i].changedMasks[generationId] & bitflag) !== 0) return true;
  }
  return false;
}

function createIterationRecord(ctx: WorldContext, entityId: number, trait: Trait, store: Store<any>) {
  const value = trait[$internal].get(ctx, entityId, store);
  let tuples: Record<string, unknown[]> | undefined;
  for (const key in trait.schema) {
    if (Array.isArray(trait.schema[key])) (tuples ??= {})[key] = value[key];
  }
  return { value, tuples };
}

function getQueryStore(ctx: WorldContext, trait: Trait): Store<any> {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance) return instance.store;
  registerTrait(ctx, trait);
  return getTraitInstance(ctx.traitInstances, trait)!.store;
}
