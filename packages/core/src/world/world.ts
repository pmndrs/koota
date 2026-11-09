import { $internal } from '../common';
import { subscribeMachine } from '../machine/machine';
import type { Machine, TransitionSubscriber } from '../machine/types';
import { assertsEnabled } from '../assert-config';
import { createEntityNotAliveError } from '../asserts';
import {
  createEntity,
  destroyEntity,
  entityHas,
  entityTargetFor,
  entityTargetsFor,
  subscribeEntityEvent,
} from '../entity/entity';
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
import { createPageTable, getPageLimit } from '../entity/utils/paged-mask';
import { findIdentifiedEntity } from '../identifier/find-identified-entity';
import { isIdentifierPair, lookupAllIdentifiers, lookupIdentifier } from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
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
import { createOwnedView } from '../query/query-view';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { isQuery } from '../query/utils/is-query';
import { isStableParameter } from '../query/modifier';
import { setChanged } from '../query/modifiers/changed';
import { getEntitiesWithRelationTo, getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import {
  addTrait,
  getTrait,
  removeTrait,
  setTrait,
  upsertTrait,
} from '../trait/trait';
import { clearTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { InlineQueryNode, World, WorldContext, WorldOptions } from './types';
import type { Subscriber } from '../trait/subscriptions';
import { endStructuralChanges, observeSettled } from './settled';
import { resolveHookCallback, resolveHookTrait, type HookInput } from './utils/resolve-hook';

let nextWorldId = 0;

/**
 * Runs a query written inline. A lone pair with a target entity reads the relation's sources
 * directly. Parameters that are the same objects as on an earlier call find their query by
 * identity, which skips building and hashing a key.
 */
export function queryWithParameters(ctx: WorldContext, params: QueryParameter[]) {
  const first = params[0];
  if (params.length === 1 && isRelationPair(first) && typeof first.target === 'number') {
    const entities = getEntitiesWithRelationTo(ctx, first.relation as Relation<Trait>, first.target);
    return createOwnedView(ctx, entities as Entity[], null, params);
  }

  const node = findInlineQuery(ctx, params);
  if (node === null) return resolveInlineQuery(ctx, params);
  return runQuery(ctx, node.query!, node.params!);
}

/** One lookup per parameter, shared by full queries and first-match queries. */
function findInlineQuery(ctx: WorldContext, params: QueryParameter[]): InlineQueryNode | null {
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let next = node.next?.get(param);
    if (next === undefined) {
      // A pair naming a target entity is a new object on every call, found by what it names.
      if (!isRelationPair(param) || typeof param.target !== 'number') {
        return null;
      }
      next = node.next?.get(param.relation as Relation<Trait>)?.next?.get(param.target);
      if (next === undefined) return null;
    }
    node = next;
  }
  return node.query === null ? null : node;
}

/** Resolves parameters seen for the first time, or ones that are new objects on every call. */
export function resolveInlineQuery(ctx: WorldContext, params: QueryParameter[]) {
  const identified = findIdentifiedEntity(ctx, params);
  if (identified !== null) {
    // Shared-key views need subscriptions even when empty or owned by one entity.
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      if (isIdentifierPair(param) && !param.identifier[$internal].exclusive) {
        return runQuery(ctx, resolveQueryInstance(ctx, params), params);
      }
    }
    return createOwnedView(ctx, identified === undefined ? [] : [identified], null, params);
  }

  const query = resolveQueryInstance(ctx, params);
  rememberInlineQuery(ctx, params, query);
  return runQuery(ctx, query, params);
}

/**
 * Lists a query under stable parameters and concrete relation targets. Queries that name a
 * target keep their tree entries so dropping the query can prune every path that reaches it.
 */
function rememberInlineQuery(ctx: WorldContext, params: QueryParameter[], query: QueryInstance) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param)) continue;
    if (!isRelationPair(param) || typeof param.target !== 'number') return;
  }
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param)) {
      node = inlineStep(node, param);
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

function inlineStep(node: InlineQueryNode, key: QueryParameter | Relation<Trait> | Entity) {
  const next = (node.next ??= new Map());
  let child = next.get(key);
  if (child === undefined) {
    child = {
      next: null,
      params: null,
      query: null,
      parent: node.parent !== null || typeof key === 'number' ? node : null,
      key,
    };
    next.set(key, child);
  }
  return child;
}

/**
 * A world owns everything it allocates. Nothing outside the world refers to it, so dropping the
 * last reference frees it. Its entities are plain numbers that only mean something to this world.
 */
export function createWorld(options?: WorldOptions): World {
  return createWorldWithAllocator(createPageAllocator([]), options);
}

/** Supplies where entity ids come from, so worlds with entity methods can share one allocator. */
export function createWorldWithAllocator(allocator: PageAllocator, options?: WorldOptions): World {
  const retain = options?.retain ?? 1024;
  if (!Number.isSafeInteger(retain) || retain < 0) {
    throw new RangeError('Koota: retain must be a non-negative safe integer.');
  }
  const id = nextWorldId++;

  // Methods read the context from their closure, which skips a load through the world object.
  const ctx = {
    entityIndex: null! as ReturnType<typeof createEntityIndex>,
    entityMasks: [createPageTable(0)],
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
    queryCallbackDepth: 0,
    queryBatch: undefined,
    internalQuerySubscriptions: undefined,
    machineMutations: undefined,
    defersChanges: false,
    targetQueries: [],
    dirtyQueries: [],
    worldEntity: null,
    destroyMarks: new Uint32Array(0),
    destroyStamp: 0,
    destroyQueue: [],
    isDestroying: false,
    entitySubscribedInstances: new Set(),
    structuralDepth: 0,
    settledQueue: new Set(),
    observeSettled,
    resetSubscriptions: new Set(),
    entitySpawnSubscriptions: new Set(),
    entityDestroySubscriptions: new Set(),
    traitRegisteredSubscriptions: new Set(),
    ...(assertsEnabled ? { structuralRevision: 0 } : {}),
  } as WorldContext;

  ctx.entityIndex = createEntityIndex(allocator, ctx);
  ctx.worldEntity = createEntity(ctx, [IsExcluded]);

  // Every entity operation takes the entity first. Without one it applies to the world itself.
  const world = {
    [$internal]: ctx,

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      return createEntity(ctx, spawnTraits);
    },

    // Only the single key form is spliced in. A larger method stops inlining into callers and
    // the key pair then escapes into a real allocation.
    lookup(start: IdentifierPair | Entity, second?: IdentifierPair): Entity | undefined {
      if (second === undefined) {
        return typeof start === 'number' ? undefined : lookupIdentifier(ctx, start);
      }
      if (arguments.length === 2) return lookupScopedKey(ctx, start, second);
      return lookupArgumentsScope(ctx, arguments, arguments.length);
    },

    lookupAll(start: IdentifierPair | Entity, second?: IdentifierPair): Entity[] {
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

    isAlive(entity: Entity): boolean {
      return isEntityAlive(ctx.entityIndex, entity);
    },

    has(
      target: Entity | Trait | RelationPair | Identifier | IdentifierPair,
      trait?: Trait | RelationPair | Identifier | IdentifierPair
    ): boolean {
      if (typeof target === 'number') {
        if (trait === undefined) return isEntityAlive(ctx.entityIndex, target);
        return entityHas(ctx, target, trait);
      }
      return hasOnWorld(ctx, target);
    },

    add(first?: Entity | ConfigurableTrait, ...traits: ConfigurableTrait[]) {
      if (typeof first === 'number') addTrait(ctx, first, traits);
      else addToWorld(ctx, first, traits);
    },

    upsert(first: Entity | Trait, second: any, value?: any) {
      if (typeof first === 'number') upsertTrait(ctx, first, second, value);
      else upsertOnWorld(ctx, first, second);
    },

    remove(
      first?: Entity | Trait | RelationPair | Identifier | IdentifierPair,
      ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
    ) {
      if (typeof first === 'number') removeTrait(ctx, first, traits);
      else removeFromWorld(ctx, first, traits);
    },

    get(
      first: Entity | Trait,
      second?: Trait | RelationPair | Record<string, unknown>,
      out?: Record<string, unknown>
    ) {
      if (typeof first === 'number') return getTrait(ctx, first, second as Trait | RelationPair, out);
      return getFromWorld(ctx, first, second as Record<string, unknown> | undefined);
    },

    set(first: Entity | Trait, second: any, value?: any, flagChanged = true) {
      if (typeof first === 'number') setTrait(ctx, first, second, value, flagChanged);
      else setOnWorld(ctx, first, second);
    },

    changed(first: Entity | Trait, trait?: Trait) {
      if (typeof first === 'number') setChanged(ctx, first, trait!);
      else changeOnWorld(ctx, first);
    },

    targetFor(entity: Entity, relation: Relation<Trait> | Identifier) {
      return entityTargetFor(ctx, entity, relation);
    },

    targetsFor(entity: Entity, relation: Relation<Trait> | Identifier) {
      return entityTargetsFor(ctx, entity, relation);
    },

    // The argument count tells the two forms apart, so an undefined entity never destroys the world.
    destroy(entity?: Entity) {
      if (typeof entity === 'number') {
        destroyEntity(ctx, entity);
        return;
      }
      if (arguments.length !== 0) throw createEntityNotAliveError(entity!);
      // Destroying is final. A second call finds nothing left to do.
      if (ctx.worldEntity === null) return;
      // Settle while the world entity still exists so an observer that reads it cannot revive it.
      ctx.structuralDepth++;
      try {
        clear(false);
      } finally {
        endStructuralChanges(ctx);
      }
    },

    reset() {
      assertNotDestroyed(ctx);
      ctx.structuralDepth++;
      try {
        clear(true);
      } finally {
        endStructuralChanges(ctx);
      }
    },

    query(...args: any[]) {
      if (args.length === 1 && isQuery(args[0])) {
        const queryRef = args[0];
        const query = ctx.queryInstances[queryRef.id] ?? resolveQueryInstanceFromRef(ctx, queryRef);
        return runQuery(ctx, query, queryRef.parameters);
      }
      return queryWithParameters(ctx, args);
    },

    queryFirst(...args: [Query<QueryParameter[]>] | QueryParameter[]) {
      if (args.length === 1) {
        const arg = args[0];
        if (isQuery(arg)) return runQueryFirst(ctx, resolveQueryInstanceFromRef(ctx, arg));
        if (isRelationPair(arg) && !arg.targetQuery && typeof arg.target === 'number') {
          return getFirstEntityWithRelationTo(
            ctx,
            arg.relation as Relation<Trait>,
            arg.target as Entity
          );
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
      return subscribeQuery(ctx, args, callback, true);
    },

    onExit(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      return subscribeQuery(ctx, args, callback, false);
    },

    onAdd(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
      return subscribe(ctx, 'addSubscriptions', first, second, callback);
    },

    onRemove(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
      return subscribe(ctx, 'removeSubscriptions', first, second, callback);
    },

    onChange(first: Entity | HookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
      return subscribe(ctx, 'changeSubscriptions', first, second, callback);
    },

    onTransition(first: Entity | Machine, second: any, callback?: TransitionSubscriber) {
      if (typeof first === 'number') return subscribeMachine(ctx, second, callback!, first);
      return subscribeMachine(ctx, first, second);
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      ctx.entitySpawnSubscriptions.add(callback);
      return () => ctx.entitySpawnSubscriptions.delete(callback);
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      ctx.entityDestroySubscriptions.add(callback);
      return () => ctx.entityDestroySubscriptions.delete(callback);
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      ctx.traitRegisteredSubscriptions.add(callback);
      return () => ctx.traitRegisteredSubscriptions.delete(callback);
    },
  } as unknown as World;

  /** Drops every entity, trait instance and query. Reset then starts over with a new world entity. */
  function clear(recreate: boolean) {
    if (assertsEnabled) ctx.structuralRevision++;

    world.entities.forEach((entity) => {
      if (isEntityAlive(ctx.entityIndex, entity)) {
        destroyEntity(ctx, entity);
      }
    });

    releaseOwnedPages(ctx.entityIndex);
    ctx.entityIndex = createEntityIndex(recreate ? ctx.entityIndex.allocator : closedAllocator, ctx);

    // The tables keep their extent, so an id from before the reset still reads a page.
    ctx.entityMasks = [createPageTable(getPageLimit(ctx))];
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
    ctx.internalQuerySubscriptions = undefined;
    ctx.inlineQueries = { next: null, params: null, query: null, parent: null, key: null };
    ctx.queryInstances.length = 0;
    ctx.tombstones.head = 0;
    ctx.tombstones.ids.length = 0;
    ctx.pairRemovals.head = 0;
    ctx.pairRemovals.entries.length = 0;
    ctx.iterationBuffers = undefined;
    ctx.actionInstances.length = 0;
    ctx.dirtyQueries.length = 0;
    ctx.notQueries.length = 0;
    ctx.targetQueries.length = 0;

    ctx.entitySubscribedInstances.clear();

    // A destroyed world has no world entity, so it holds no page another world could use.
    ctx.worldEntity = recreate ? createEntity(ctx, [IsExcluded]) : null;

    for (const sub of ctx.resetSubscriptions) {
      sub();
    }
  }

  // Accessors are added after the literal. Redefining a literal data property
  // as a getter would drop the world into V8 dictionary mode.
  Object.defineProperty(world, 'retain', {
    get: () => ctx.retain,
    enumerable: true,
  });

  Object.defineProperty(world, 'traits', {
    get: () => ctx.traits,
    enumerable: true,
  });

  Object.defineProperty(world, 'id', {
    get: () => id,
    enumerable: true,
  });
  Object.defineProperty(world, 'entities', {
    get: () => getAliveEntities(ctx.entityIndex),
    enumerable: true,
  });

  return world;
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
  removeTrait(ctx, ctx.worldEntity, traits);
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
  const subscribers = ensureTraitInstance(ctx, trait)[event].all;
  subscribers.add(resolved);
  return () => subscribers.delete(resolved);
}
