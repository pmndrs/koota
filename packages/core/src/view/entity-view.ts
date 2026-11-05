import { $internal } from '../common';
import { isNameConfig } from '../name/name-index';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isEntityAlive, isEntityReadable } from '../entity/utils/entity-index';
import { isRelationPair } from '../relation/utils/is-relation';
import type { Store } from '../storage';
import { registerTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { hasSubscribers } from '../trait/subscriptions';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import { isModifier } from '../query/modifier';
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
  UpdateEachOptions,
} from '../query/types';

/** The live prefix of an entity sequence. Storage stays indexed by entity id. */
export type EntitySource = {
  readonly dense: readonly number[];
  readonly length: number;
};

type Callback = (...args: any[]) => void;

/**
 * Shared traversal over entity sequences. Queries guard pending removals, and ordered sources
 * retain the arrays read by active walks. toArray returns a plain array the caller owns.
 */
export class EntityView {
  ctx: WorldContext;
  /** Null for lookups that bypass a query instance, such as named and relation fast paths. */
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
    // A local cursor can be eliminated by V8. Reuse its result to avoid per-entity allocations.
    return {
      index: 0,
      length: dense.length,
      dense,
      guard,
      ctx: this.ctx,
      result: { value: 0 as Entity, done: false },
      next: this.query?.retains ? nextRetainedViewIterator : nextViewIterator,
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
    try {
      for (let i = 0; i < length; i++) {
        const entity = dense[i] as Entity;
        if (this.query?.retains && !isEntityReadable(this.ctx.entityIndex, entity)) continue;
        callback(entity, i);
      }
    } finally {
      if (guard) guard.iterating--;
    }
  }

  map<U>(callback: (entity: Entity, index: number) => U): U[] {
    const result: U[] = [];
    this.forEach((entity, index) => result.push(callback(entity, index)));
    return result;
  }

  readEach(callback: Callback) {
    const { dense, length } = this.getSource();
    if (length === 0) return this;
    const { ctx, query } = this;
    const guard = this.getGuard();
    const { stores } = this.binding;
    const pool = query ?? ctx;
    const buffers = takeIterationBuffers(ctx, pool, dense as Entity[], this.binding);
    buffers.retains = query?.retains ?? false;
    if (guard) guard.iterating++;
    try {
      buffers.iterators!.readEach(ctx, dense as Entity[], length, callback, buffers, stores);
    } finally {
      if (guard) guard.iterating--;
      releaseIterationBuffers(pool, buffers);
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
    const buffers = takeIterationBuffers(ctx, pool, entities, this.binding);
    buffers.retains = query?.retains ?? false;
    const iterators = buffers.iterators!;
    if (guard) guard.iterating++;
    try {
      if (trackTraits(ctx, query, traits, buffers.modes, options?.changeDetection) === 0) {
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
          const entity = changedEntities[i];
          if (isEntityAlive(ctx.entityIndex, entity)) notifyChanged(ctx, entity, changedTraits[i]);
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
    }
    return this;
  }
}

/** Walks the membership present when the loop started. */
interface ViewIterator extends IterableIterator<Entity> {
  index: number;
  readonly length: number;
  readonly dense: readonly number[];
  readonly guard: { iterating: number } | null;
  readonly ctx: WorldContext;
  readonly result: { value: Entity; done: boolean };
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

/** Retained walks skip entries evicted while a callback holds the original array. */
function nextRetainedViewIterator(this: ViewIterator): IteratorResult<Entity> {
  while (this.index < this.length) {
    const entity = this.dense[this.index++] as Entity;
    if (!isEntityReadable(this.ctx.entityIndex, entity)) continue;
    this.result.value = entity;
    return this.result as IteratorResult<Entity>;
  }
  finishViewIterator(this);
  this.result.value = 0 as Entity;
  return this.result as IteratorResult<Entity>;
}

function returnViewIterator(this: ViewIterator): IteratorResult<Entity> {
  finishViewIterator(this);
  return this.result as IteratorResult<Entity>;
}

function iterateViewIterator(this: ViewIterator) {
  return this;
}

function finishViewIterator(iterator: ViewIterator) {
  if (!iterator.result.done) {
    iterator.result.done = true;
    iterator.index = iterator.length;
    if (iterator.guard) iterator.guard.iterating--;
  }
}

/** Handle-only snapshots need no world-specific stores or query-owned view cache. */
const entityBinding: QueryViewBinding = {
  params: [],
  traits: [],
  stores: [],
  view: null,
  iterators: null,
};

/**
 * Finds or builds the trait and store lists for a parameter list. Bindings are cached on the query
 * and never mutated, so views share them and select swaps references. A query ref passes the
 * same parameters array every run, so identity settles the common case before any walk. The cache
 * holds one binding per distinct trait list, which stays small since trait lists are static code.
 */
export function getQueryBinding(
  ctx: WorldContext,
  query: QueryInstance | null,
  params: QueryParameter[]
): QueryViewBinding {
  if (
    query === null &&
    (params.length === 0 ||
      (params.length === 1 && (isRelationPair(params[0]) || isNameConfig(params[0]))))
  ) {
    return entityBinding;
  }
  const cache = query?.viewBindings;
  if (cache) {
    for (let i = 0; i < cache.length; i++) {
      const binding = cache[i];
      if (sameParams(binding.params, params) || matchesQueryBinding(ctx, params, binding))
        return binding;
    }
  }
  const binding: QueryViewBinding = { params, traits: [], stores: [], view: null, iterators: null };
  fillQueryBinding(ctx, params, binding);
  if (cache) cache.push(binding);
  return binding;
}

/** Inline parameters arrive in a fresh array each run, so compare the entries by identity. */
export function sameParams(a: QueryParameter[], b: QueryParameter[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Mirrors fillQueryBinding, comparing each stored trait and its current store in order. */
export function matchesQueryBinding(
  ctx: WorldContext,
  params: QueryParameter[],
  { traits, stores }: QueryViewBinding
): boolean {
  let index = 0;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isNameConfig(param) || isRelationPair(param)) continue;
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (const trait of param.traits) {
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        if (
          traits[index] !== trait ||
          getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
        )
          return false;
        index++;
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      if (
        traits[index] !== trait ||
        getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
      )
        return false;
      index++;
    }
  }
  return index === traits.length;
}

/** Collects the stored traits of a parameter list in order, registering any that are new. */
function fillQueryBinding(
  ctx: WorldContext,
  params: QueryParameter[],
  { traits, stores }: QueryViewBinding
) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isNameConfig(param) || isRelationPair(param)) continue;
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (const trait of param.traits) {
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        traits.push(trait);
        stores.push(getQueryStore(ctx, trait));
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      traits.push(trait);
      stores.push(getQueryStore(ctx, trait));
    }
  }
}

function createIterationBuffers(): QueryIterationBuffers {
  return {
    state: [],
    traits: [],
    records: [],
    iterators: undefined,
    retains: false,
    modes: [],
    atomicSnapshots: [],
    changedEntities: [],
    changedTraits: [],
    next: undefined,
  };
}

/** Checks out buffers from the pool, preparing them when the trait list differs. */
function takeIterationBuffers(
  ctx: WorldContext,
  pool: QueryInstance | WorldContext,
  entities: Entity[],
  binding: QueryViewBinding
): QueryIterationBuffers {
  const buffers = pool.iterationBuffers ?? createIterationBuffers();
  pool.iterationBuffers = buffers.next;
  if (buffers.traits !== binding.traits) {
    prepareIterationBuffers(ctx, buffers, entities, binding, pool);
  }
  return buffers;
}

/**
 * Points the buffers at a new trait list. Records already built for the same trait are kept. A
 * query binding compiles its own iterators, since every generated function with the same source
 * would otherwise share one feedback vector and its callback site would turn megamorphic across
 * queries. Views without a query share iterators per trait list.
 */
function prepareIterationBuffers(
  ctx: WorldContext,
  buffers: QueryIterationBuffers,
  entities: Entity[],
  binding: QueryViewBinding,
  pool: QueryInstance | WorldContext
) {
  const { traits, stores } = binding;
  const { state, records } = buffers;
  const prepared = buffers.traits;
  if (buffers.iterators !== undefined && sameParams(prepared, traits)) {
    buffers.traits = traits;
    return;
  }
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    state[i] = undefined;
    if (prepared[i] === trait) continue;
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
  buffers.traits = traits;
  buffers.iterators =
    pool === ctx ? getQueryIterators(traits) : (binding.iterators ??= compileQueryIterators(traits));
}

/** Releases references to user objects, then returns the buffers to the pool. */
function releaseIterationBuffers(pool: QueryInstance | WorldContext, buffers: QueryIterationBuffers) {
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
  query: QueryInstance | null,
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
          (hasSubscribers(instance.changeSubscriptions) ||
            (query !== null && (query.changedMasks[instance.generationId] & instance.bitflag) !== 0));
    if (!tracked) {
      modes[i] = 0;
      continue;
    }
    modes[i] = changeDetection === 'always' ? 3 : trait[$internal].type === 'aos' ? 2 : 1;
    trackedCount++;
  }
  return trackedCount;
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
