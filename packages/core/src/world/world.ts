import { getOrderedSnapshot } from '../relation/ordered';
import { createQueryStore } from '../query/query-store';
import { beginDefer, endDefer, observeSettled, runDeferred } from './defer';
import { $internal } from '../common';
import { subscribeMachine } from '../machine/machine';
import type { Machine, TransitionSubscriber } from '../machine/types';
import { assertsEnabled } from '../assert-config';
import { assertOutsideDefer, createEntityNotAliveError } from '../asserts';
import {
  applyDestroyEntity,
  createEntity,
  destroyEntity,
  entityHas,
  entityTargetFor,
  entityTargetsFor,
  subscribeEntityEvent,
} from '../entity/entity';
import { installEntityMethods } from '../entity/entity-methods';
import type { Entity } from '../entity/types';
import {
  createEntityIndex,
  getAliveEntities,
  isEntityAlive,
  releaseOwnedPages,
} from '../entity/utils/entity-index';
import {
  closedAllocator,
  createPageAllocator,
  type PageAllocator,
} from '../entity/utils/page-allocator';
import { getEntityId } from '../entity/utils/pack-entity';
import { sharedAllocator } from '../entity/utils/shared-allocator';
import { createPageTable } from '../utils/page-table';
import { EMPTY_MASK_PAGE } from './utils/entity-masks';
import { getPageLimit } from './utils/page-tables';
import { findIdentifiedEntity } from '../identifier/find-identified-entity';
import { isIdentifierPair, lookupAllIdentifiers, lookupIdentifier } from '../identifier/identifier';
import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import {
  lookupArgumentsScope,
  lookupScopedKey,
  lookupScopeStart,
} from '../identifier/scoped-identifier';
import {
  IsExcluded,
  ensureTraitInstance,
  resolveQueryInstance,
  resolveQueryInstanceFromRef,
  runQuery,
  runQueryFirst,
  subscribeQuery,
} from '../query/query';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { isQuery } from '../query/utils/is-query';
import { isStableParameter } from '../query/modifier';
import { subscribeRelationFilter } from '../relation/filter-hooks';
import { setChanged } from '../query/modifiers/changed';
import { getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, removeTrait, setTrait, upsertTrait } from '../trait/trait';
import { clearTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { InlineQueryNode, World, WorldContext, WorldOptions } from './types';
import type { Subscriber } from '../trait/subscriptions';
import type { HookInput } from './utils/resolve-hook';

let nextWorldId = 0;

/**
 * Calls listen with the world entity, and again each time reset or destroy replaces it. A
 * destroyed world has no world entity, so listen then receives undefined.
 */
function observeWorldEntity(
  this: WorldContext,
  listen: (entity: Entity | undefined) => (() => void) | void
) {
  let detach: (() => void) | void;
  let revision = 0;
  const rebind = () => {
    const current = ++revision;
    detach?.();
    detach = undefined;
    const next = listen(this.worldEntity ?? undefined);
    // The first call to listen can reset its own world.
    if (current === revision) detach = next;
    else next?.();
  };
  const stop = () => {
    this.resetSubscriptions.delete(rebind);
    revision++;
    detach?.();
  };
  this.resetSubscriptions.add(rebind);
  try {
    rebind();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

/** Inline and compiled queries share the live view for their membership and projection. */
export function queryWithParameters(ctx: WorldContext, params: QueryParameter[]) {
  const node = findInlineQuery(ctx, params);
  if (node !== null) return runQuery(ctx, node.query!, node.params!);

  const query = resolveQueryInstance(ctx, params);
  rememberInlineQuery(ctx, params, query);
  return runQuery(ctx, query, params);
}

/** One lookup per parameter, shared by full queries and first-match queries. */
function findInlineQuery(ctx: WorldContext, params: QueryParameter[]): InlineQueryNode | null {
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let next = node.next?.get(param);
    if (next === undefined) {
      // Fresh pair objects share a path by definition and target.
      if (isIdentifierPair(param)) {
        next = node.next?.get(param.identifier)?.next?.get(param.target);
      } else if (isRelationPair(param) && typeof param.target === 'number') {
        next = node.next?.get(param.relation as Relation<Trait>)?.next?.get(param.target);
      } else return null;
      if (next === undefined) return null;
    }
    node = next;
  }
  return node.query === null ? null : node;
}

/**
 * Lists a query under stable parameters, identifier keys and concrete relation targets. Queries that name a
 * target keep their tree entries so dropping the query can prune every path that reaches it.
 */
function rememberInlineQuery(ctx: WorldContext, params: QueryParameter[], query: QueryInstance) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param) || isIdentifierPair(param)) continue;
    if (!isRelationPair(param) || typeof param.target !== 'number') return;
  }
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param)) {
      node = inlineStep(node, param);
      continue;
    }
    if (isIdentifierPair(param)) {
      node = inlineStep(inlineStep(node, param.identifier), param.target);
      continue;
    }
    const pair = param as RelationPair;
    const relationStep = inlineStep(node, pair.relation as Relation<Trait>);
    node = inlineStep(relationStep, pair.target as Entity);
  }
  node.params = params;
  node.query = query;
  if (node.parent !== null) (query.inlineNodes ??= []).push(node);
}

function inlineStep(node: InlineQueryNode, key: QueryParameter | Relation<Trait> | IdentifierKey) {
  const next = (node.next ??= new Map());
  let child = next.get(key);
  if (child === undefined) {
    child = {
      next: null,
      params: null,
      query: null,
      parent:
        node.parent !== null || typeof key === 'number' || typeof key === 'string' ? node : null,
      key,
    };
    next.set(key, child);
  }
  return child;
}

/**
 * Creates a world whose entities carry methods, so entity.get(Position) works without the world
 * at hand. Worlds created here share one id space, which is how a method finds the world that
 * owns its entity. That table holds a world until it is destroyed.
 */
export function createWorld(options?: WorldOptions): World {
  installEntityMethods();
  return createWorldWithAllocator(sharedAllocator, options);
}

/**
 * Creates a world that owns its allocator. Nothing outside the world refers to it, so dropping
 * the last reference frees it. Its entities carry no methods and only mean something to this
 * world. A program must not mix these with worlds from createWorld, since an entity method
 * cannot tell the two apart and reaches whichever shared world holds that id.
 */
export function createIsolatedWorld(options?: WorldOptions): World {
  return createWorldWithAllocator(createPageAllocator([]), options);
}

/** The allocator decides where entity ids come from, shared between worlds or owned by this one. */
function createWorldWithAllocator(allocator: PageAllocator, options?: WorldOptions): World {
  const retain = options?.retain ?? 1024;
  if (!Number.isSafeInteger(retain) || retain < 0) {
    throw new RangeError('Koota: retain must be a non-negative safe integer.');
  }
  const id = nextWorldId++;

  const ctx = {
    entityIndex: null! as ReturnType<typeof createEntityIndex>,
    entityMasks: [createPageTable(0, EMPTY_MASK_PAGE)],
    retain,
    tombstones: { ids: [], head: 0 },
    pairRemovals: { entries: [], head: 0 },
    bitflag: 1,
    traitInstances: [],
    traitsByBit: [[]],
    traits: new Set<Trait>(),
    relations: [],
    queriesHashMap: new Map(),
    inlineQueries: { next: null, params: null, query: null, parent: null, key: null },
    queryInstances: [],
    iterationBuffers: undefined,
    actionInstances: [],
    notQueries: [],
    queryBatch: undefined,
    targetQuerySubscriptions: undefined,
    defersChanges: false,
    trackingRevision: 0,
    targetQueries: [],
    commands: [],
    commandCount: 0,
    unsettled: false,
    destroyQueue: [],
    targetFlags: [],
    destroying: undefined,
    worldEntity: null,
    entitySubscribedInstances: new Set(),
    deferDepth: 0,
    settledQueue: new Set(),
    observeSettled,
    getOrderedSnapshot,
    createQueryStore,
    resetSubscriptions: new Set(),
    observeWorldEntity,
    entitySpawnSubscriptions: new Set(),
    entityDestroySubscriptions: new Set(),
    traitRegisteredSubscriptions: new Set(),
  } as WorldContext;

  ctx.entityIndex = createEntityIndex(allocator, ctx);
  ctx.worldEntity = createEntity(ctx, [IsExcluded]);

  // Every world has the same properties in the same order, so all worlds share one hidden class.
  return Object.create(worldMethods, {
    [$internal]: { value: ctx },
    id: { value: id, enumerable: true },
    retain: { value: retain, enumerable: true },
    traits: { value: ctx.traits, enumerable: true },
    entities: { get: getEntities, enumerable: true },
  }) as World;
}

function getEntities(this: World): Entity[] {
  return getAliveEntities(this[$internal].entityIndex);
}

/**
 * The methods of every world. They are one set of functions that find the context through the
 * world they are called on, so a call site that serves several worlds still sees one function.
 * A method must be called on its world and does not work once detached from it. Every entity
 * operation takes the entity first. Without one it applies to the world itself.
 */
const worldMethods: ThisType<World> = {
  spawn(...spawnTraits: ConfigurableTrait[]): Entity {
    const ctx = this[$internal];
    return createEntity(ctx, spawnTraits);
  },

  defer<T>(fn: () => T): T {
    return runDeferred(this[$internal], fn);
  },

  // Only the single key form is spliced in. A larger method stops inlining into callers and
  // the key pair then escapes into a real allocation.
  lookup(start: IdentifierPair | Entity, second?: IdentifierPair): Entity | undefined {
    const ctx = this[$internal];
    if (second === undefined) {
      return typeof start === 'number' ? undefined : lookupIdentifier(ctx, start);
    }
    if (arguments.length === 2) return lookupScopedKey(ctx, start, second);
    return lookupArgumentsScope(ctx, arguments, arguments.length);
  },

  lookupAll(start: IdentifierPair | Entity, second?: IdentifierPair): Entity[] {
    const ctx = this[$internal];
    if (second === undefined) {
      return typeof start === 'number' ? [] : lookupAllIdentifiers(ctx, start, undefined);
    }
    const last = arguments.length - 1;
    const scope =
      last === 1 ? lookupScopeStart(ctx, start) : lookupArgumentsScope(ctx, arguments, last);
    return scope === undefined
      ? []
      : lookupAllIdentifiers(ctx, arguments[last] as IdentifierPair, scope);
  },

  has(
    target: Entity | Trait | RelationPair | Identifier | IdentifierPair,
    trait?: Trait | RelationPair | Identifier | IdentifierPair
  ): boolean {
    const ctx = this[$internal];
    if (typeof target === 'number') {
      // A lone entity is a liveness check. Assertions count the arguments, so a trait that is
      // undefined by mistake reaches the trait check and throws.
      if (trait === undefined && (!assertsEnabled || arguments.length === 1)) {
        return isEntityAlive(ctx.entityIndex, target);
      }
      return entityHas(ctx, target, trait!);
    }
    return hasOnWorld(ctx, target);
  },

  add(first?: Entity | ConfigurableTrait, ...traits: ConfigurableTrait[]) {
    const ctx = this[$internal];
    if (typeof first === 'number') addTrait(ctx, first, traits);
    else addToWorld(ctx, first, traits);
  },

  upsert(first: Entity | Trait, second: any, value?: any) {
    const ctx = this[$internal];
    if (typeof first === 'number') upsertTrait(ctx, first, second, value);
    else upsertOnWorld(ctx, first, second);
  },

  remove(
    first?: Entity | Trait | RelationPair | Identifier | IdentifierPair,
    ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
  ) {
    const ctx = this[$internal];
    if (typeof first === 'number') removeTrait(ctx, first, ...traits);
    else removeFromWorld(ctx, first, traits);
  },

  get(
    first: Entity | Trait,
    second?: Trait | RelationPair | Record<string, unknown>,
    out?: Record<string, unknown>
  ) {
    const ctx = this[$internal];
    if (typeof first === 'number') return getTrait(ctx, first, second as Trait | RelationPair, out);
    return getFromWorld(ctx, first, second as Record<string, unknown> | undefined);
  },

  set(first: Entity | Trait, second: any, value?: any, flagChanged = true) {
    const ctx = this[$internal];
    if (typeof first === 'number') setTrait(ctx, first, second, value, flagChanged);
    else setOnWorld(ctx, first, second);
  },

  changed(first: Entity | Trait, trait?: Trait) {
    const ctx = this[$internal];
    if (typeof first === 'number') setChanged(ctx, first, trait!);
    else changeOnWorld(ctx, first);
  },

  targetFor(entity: Entity, relation: Relation<Trait> | Identifier) {
    return entityTargetFor(this[$internal], entity, relation);
  },

  targetsFor(entity: Entity, relation: Relation<Trait> | Identifier) {
    return entityTargetsFor(this[$internal], entity, relation);
  },

  // The argument count tells the two forms apart, so an undefined entity never destroys the world.
  destroy(entity?: Entity) {
    const ctx = this[$internal];
    if (typeof entity === 'number') {
      destroyEntity(ctx, entity);
      return;
    }
    if (arguments.length !== 0) throw createEntityNotAliveError(entity!);
    // Destroying is final. A second call finds nothing left to do.
    if (ctx.worldEntity === null) return;
    assertOutsideDefer(ctx, 'world.destroy');
    clearWorld(ctx, false);
  },

  reset() {
    const ctx = this[$internal];
    assertNotDestroyed(ctx);
    assertOutsideDefer(ctx, 'world.reset');
    clearWorld(ctx, true);
  },

  query(...args: any[]) {
    const ctx = this[$internal];
    if (args.length === 1 && isQuery(args[0])) {
      const queryRef = args[0];
      const query = ctx.queryInstances[queryRef.id] ?? resolveQueryInstanceFromRef(ctx, queryRef);
      return runQuery(ctx, query, queryRef.parameters);
    }
    return queryWithParameters(ctx, args);
  },

  queryFirst(...args: [Query<QueryParameter[]>] | QueryParameter[]) {
    const ctx = this[$internal];
    if (args.length === 1) {
      const arg = args[0];
      if (isQuery(arg)) return runQueryFirst(ctx, resolveQueryInstanceFromRef(ctx, arg));
      if (isRelationPair(arg) && typeof arg.target === 'number') {
        const id = getEntityId(arg.target);
        // An existing query may have reordered its members as sources entered or left.
        if (!ctx.targetQueries[id >>> 10]?.[id & 1023]?.length) {
          return getFirstEntityWithRelationTo(ctx, arg.relation as Relation<Trait>, arg.target);
        }
      }
    }

    const node = findInlineQuery(ctx, args as QueryParameter[]);
    if (node !== null) return runQueryFirst(ctx, node.query!);

    const identified = findIdentifiedEntity(ctx, args as QueryParameter[]);
    if (identified !== null) return identified;

    const query = resolveQueryInstance(ctx, args as QueryParameter[]);
    rememberInlineQuery(ctx, args as QueryParameter[], query);
    return runQueryFirst(ctx, query);
  },

  onEnter(
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
  ): QueryUnsubscriber {
    return subscribeQuery(this[$internal], args, callback, true);
  },

  onExit(
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
  ): QueryUnsubscriber {
    return subscribeQuery(this[$internal], args, callback, false);
  },

  onAdd(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
    return subscribe(this[$internal], 'addSubscriptions', first, second, callback);
  },

  onRemove(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
    return subscribe(this[$internal], 'removeSubscriptions', first, second, callback);
  },

  onChange(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
    return subscribe(this[$internal], 'changeSubscriptions', first, second, callback);
  },

  onTransition(first: Entity | Machine, second: any, callback?: TransitionSubscriber) {
    const ctx = this[$internal];
    if (typeof first === 'number') return subscribeMachine(ctx, second, callback!, first);
    return subscribeMachine(ctx, first, second);
  },

  onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
    const subscriptions = this[$internal].entitySpawnSubscriptions;
    subscriptions.add(callback);
    return () => subscriptions.delete(callback);
  },

  onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
    const subscriptions = this[$internal].entityDestroySubscriptions;
    subscriptions.add(callback);
    return () => subscriptions.delete(callback);
  },

  onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
    const subscriptions = this[$internal].traitRegisteredSubscriptions;
    subscriptions.add(callback);
    return () => subscriptions.delete(callback);
  },
};

/** Drops every entity, trait instance and query. Reset then starts over with a new world entity. */
function clearWorld(ctx: WorldContext, recreate: boolean) {
  beginDefer(ctx);
  try {
    getAliveEntities(ctx.entityIndex).forEach((entity) => {
      if (isEntityAlive(ctx.entityIndex, entity)) {
        applyDestroyEntity(ctx, entity);
      }
    });

    releaseOwnedPages(ctx.entityIndex);
    ctx.entityIndex = createEntityIndex(recreate ? ctx.entityIndex.allocator : closedAllocator, ctx);

    // The tables keep their extent, so an id from before the reset still reads a page.
    ctx.entityMasks = [createPageTable(getPageLimit(ctx), EMPTY_MASK_PAGE)];
    ctx.traitsByBit = [[]];
    ctx.bitflag = 1;
    ctx.defersChanges = false;

    for (const query of ctx.queriesHashMap.values()) {
      query.inlineNodes = null;
      if (query.cleanup === null) continue;
      for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
    }

    clearTraitInstance(ctx.traitInstances);
    ctx.traits.clear();
    ctx.relations.length = 0;

    ctx.queriesHashMap.clear();
    ctx.targetQuerySubscriptions = undefined;
    ctx.inlineQueries = { next: null, params: null, query: null, parent: null, key: null };
    ctx.queryInstances.length = 0;
    ctx.tombstones.head = 0;
    ctx.tombstones.ids.length = 0;
    ctx.pairRemovals.head = 0;
    ctx.pairRemovals.entries.length = 0;
    ctx.iterationBuffers = undefined;
    ctx.actionInstances.length = 0;
    ctx.notQueries.length = 0;
    ctx.targetQueries.length = 0;

    ctx.entitySubscribedInstances.clear();

    // A destroyed world has no world entity, so it holds no page another world could use.
    ctx.worldEntity = recreate ? createEntity(ctx, [IsExcluded]) : null;

    for (const sub of ctx.resetSubscriptions) {
      sub();
    }
  } finally {
    endDefer(ctx);
  }
}

// The forms without an entity apply to the world entity. They stay out of line so the entity
// forms above keep their inlining budget. A destroyed world has no world entity, so reads and
// removals find nothing and writes throw.

function assertNotDestroyed(ctx: WorldContext) {
  if (ctx.worldEntity === null) throw new Error('Koota: The world was destroyed.');
}

function getWorldEntity(ctx: WorldContext): Entity {
  assertNotDestroyed(ctx);
  return ctx.worldEntity!;
}

/**
 * A missing entity lands in the world forms, where its place is taken by a trait. Report it as
 * the dead entity it is instead of applying the call to the world.
 */
function assertTrait(trait: unknown) {
  if (trait == null) throw createEntityNotAliveError(trait as unknown as Entity);
}

/**
 * Adding or removing nothing is allowed. An undefined followed by traits is a missing entity.
 * Returns whether there is work to do.
 */
function assertTraitOrEmpty(first: unknown, rest: unknown[]): boolean {
  if (first != null) return true;
  if (rest.length !== 0) throw createEntityNotAliveError(first as unknown as Entity);
  return false;
}

function hasOnWorld(
  ctx: WorldContext,
  trait: Trait | RelationPair | Identifier | IdentifierPair
): boolean {
  assertTrait(trait);
  return ctx.worldEntity !== null && entityHas(ctx, ctx.worldEntity, trait);
}

function addToWorld(
  ctx: WorldContext,
  first: ConfigurableTrait | undefined,
  traits: ConfigurableTrait[]
) {
  if (!assertTraitOrEmpty(first, traits)) return;
  traits.unshift(first!);
  addTrait(ctx, getWorldEntity(ctx), traits);
}

function upsertOnWorld(ctx: WorldContext, trait: Trait, value: any) {
  assertTrait(trait);
  upsertTrait(ctx, getWorldEntity(ctx), trait, value);
}

function removeFromWorld(
  ctx: WorldContext,
  first: Trait | RelationPair | Identifier | IdentifierPair | undefined,
  traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  if (!assertTraitOrEmpty(first, traits) || ctx.worldEntity === null) return;
  traits.unshift(first!);
  removeTrait(ctx, ctx.worldEntity, ...traits);
}

function getFromWorld(ctx: WorldContext, trait: Trait, out: Record<string, unknown> | undefined) {
  assertTrait(trait);
  return ctx.worldEntity === null ? undefined : getTrait(ctx, ctx.worldEntity, trait, out);
}

function changeOnWorld(ctx: WorldContext, trait: Trait) {
  assertTrait(trait);
  if (ctx.worldEntity !== null) setChanged(ctx, ctx.worldEntity, trait);
}

function setOnWorld(ctx: WorldContext, trait: Trait, value: any) {
  assertTrait(trait);
  setTrait(ctx, getWorldEntity(ctx), trait, value, true);
}

/** Subscribes to a trait event for every entity, or for one when an entity comes first. */
function subscribe(
  ctx: WorldContext,
  event: 'addSubscriptions' | 'removeSubscriptions' | 'changeSubscriptions',
  first: Entity | HookInput,
  second: HookInput | Subscriber<any>,
  callback: Subscriber<any> | undefined
): QueryUnsubscriber {
  if (typeof first === 'number') {
    return subscribeEntityEvent(ctx, first, event, second as HookInput, callback!);
  }
  assertTrait(first);
  const trait = resolveHookTrait(first);
  const resolved = resolveHookCallback(ctx, first, second as Subscriber<any>);
  if (event === 'changeSubscriptions') ctx.trackingRevision++;
  const instance = ensureTraitInstance(ctx, trait);
  const unsubscribe = subscribeAll(instance[event], resolved);
  if (event === 'changeSubscriptions' || !isRelationPair(first) || !first.targetQuery) {
    return unsubscribe;
  }
  const stop = subscribeRelationFilter(
    ctx,
    instance,
    first,
    event === 'addSubscriptions',
    second as Subscriber<any>
  );
  return () => {
    unsubscribe();
    stop();
  };
}
