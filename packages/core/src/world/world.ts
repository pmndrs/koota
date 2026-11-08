import { endStructuralChanges, observeSettled } from './settled';
import { $internal } from '../common';
import { subscribeMachine } from '../machine/machine';
import type { Machine, TransitionSubscriber } from '../machine/types';
import { assertsEnabled } from '../assert-config';
import { createEntity, destroyEntity, entityHas } from '../entity/entity';
import type { Entity } from '../entity/types';
import {
  createEntityIndex,
  getAliveEntities,
  isEntityAlive,
  releaseOwnedPages,
} from '../entity/utils/entity-index';
import { addressSpace } from '../entity/utils/address-space';
import type { PageCleanupToken } from '../entity/utils/page-allocator';
import { createEmptyMaskGeneration } from '../entity/utils/paged-mask';
import { findIdentifiedEntity } from '../identifier/find-identified-entity';
import { isIdentifierPair, lookupAllIdentifiers, lookupIdentifier } from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import {
  IsExcluded,
  createQueryInstance,
  resolveQueryInstance,
  resolveQueryInstanceFromRef,
  runQuery,
  runQueryFirst,
} from '../query/query';
import { createOwnedView } from '../query/query-view';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { isQuery } from '../query/utils/is-query';
import { isStableParameter } from '../query/modifier';
import { getEntitiesWithRelationTo, getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import {
  addTrait,
  getTrait,
  registerTrait,
  removeTrait,
  setTrait,
  upsertTrait,
} from '../trait/trait';
import { clearTraitInstance, getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitInit,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { InlineQueryNode, World, WorldContext, WorldOptions } from './types';
import type { Subscriber } from '../trait/subscriptions';
import { resolveHookCallback, resolveHookTrait, type HookInput } from './utils/resolve-hook';

let nextWorldId = 0;

/** Registers IsExcluded and creates the world entity on first mutation. */
function ensureWorldRegistered(ctx: WorldContext): void {
  if (ctx.isRegistered) return;
  ctx.isRegistered = true;
  if (ctx.cleanupToken) ctx.cleanupToken.registered = true;

  if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(ctx, IsExcluded);

  ctx.worldEntity = createEntity(ctx, [IsExcluded]);
}

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

export function createWorld(options?: WorldOptions): World {
  const retain = options?.retain ?? 1024;
  if (!Number.isSafeInteger(retain) || retain < 0) {
    throw new RangeError('Koota: retain must be a non-negative safe integer.');
  }
  const id = nextWorldId++;

  const cleanupToken: PageCleanupToken = {
    ownedPages: [],
    registered: false,
  };

  const world = {
    [$internal]: {
      entityIndex: null! as ReturnType<typeof createEntityIndex>,
      entityMasks: [createEmptyMaskGeneration()],
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
      worldEntity: null!,
      entitySubscribedInstances: new Set(),
      structuralDepth: 0,
      settledQueue: new Set(),
      observeSettled,
      resetSubscriptions: new Set(),
      entitySpawnSubscriptions: new Set(),
      entityDestroySubscriptions: new Set(),
      traitRegisteredSubscriptions: new Set(),
      isRegistered: false,
      cleanupToken,
      ...(assertsEnabled ? { structuralRevision: 0 } : {}),
    } as WorldContext,

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return createEntity(ctx, spawnTraits);
    },

    lookup(pair: IdentifierPair): Entity | undefined {
      return lookupIdentifier(world[$internal], pair);
    },

    lookupAll(pair: IdentifierPair): Entity[] {
      return lookupAllIdentifiers(world[$internal], pair);
    },

    has(target: Entity | Trait | Identifier | IdentifierPair): boolean {
      const ctx = world[$internal];
      if (!ctx.isRegistered) {
        if (typeof target === 'number') return false;
        return false;
      }
      return typeof target === 'number'
        ? isEntityAlive(ctx.entityIndex, target)
        : entityHas(ctx, ctx.worldEntity, target);
    },

    add(...addTraits: ConfigurableTrait[]) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      addTrait(ctx, ctx.worldEntity, addTraits);
    },

    upsert<T extends Trait>(trait: T, value: TraitInit<ExtractSchema<T>>) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      upsertTrait(ctx, ctx.worldEntity, trait, value);
    },

    remove(...removeTraits: (Trait | Identifier | IdentifierPair)[]) {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;
      removeTrait(ctx, ctx.worldEntity, ...removeTraits);
    },

    get<T extends Trait>(trait: T, out?: Record<string, unknown>) {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return undefined;
      return getTrait(ctx, ctx.worldEntity, trait, out) as TraitRecord<ExtractSchema<T>> | undefined;
    },

    set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      setTrait(ctx, ctx.worldEntity, trait, value, true);
    },

    destroy() {
      const ctx = world[$internal];
      if (ctx.isRegistered) {
        // Settle while the world is still registered so an observer that reads it cannot revive it.
        ctx.structuralDepth++;
        try {
          destroyEntity(ctx, ctx.worldEntity);
          ctx.worldEntity = null!;
          world.reset();
        } finally {
          endStructuralChanges(ctx);
        }
      }
      ctx.isRegistered = false;
      addressSpace.worldFinalizer.unregister(world);
    },

    reset() {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;
      ctx.structuralDepth++;
      try {
        if (assertsEnabled) ctx.structuralRevision++;

        world.entities.forEach((entity) => {
          if (isEntityAlive(ctx.entityIndex, entity)) {
            destroyEntity(ctx, entity);
          }
        });

        releaseOwnedPages(ctx.entityIndex);
        ctx.entityIndex = createEntityIndex(addressSpace, ctx);
        // Re-link shared ownedPages for the cleanup token.
        ctx.entityIndex.ownedPages = cleanupToken.ownedPages;

        ctx.entityMasks = [createEmptyMaskGeneration()];
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

        ctx.worldEntity = createEntity(ctx, [IsExcluded]);

        for (const sub of ctx.resetSubscriptions) {
          sub();
        }
      } finally {
        endStructuralChanges(ctx);
      }
    },

    query(...args: any[]) {
      const ctx = world[$internal];
      if (!ctx.isRegistered) ensureWorldRegistered(ctx);

      if (args.length === 1 && isQuery(args[0])) {
        const queryRef = args[0];
        const query = ctx.queryInstances[queryRef.id] ?? resolveQueryInstanceFromRef(ctx, queryRef);
        return runQuery(ctx, query, queryRef.parameters);
      }
      return queryWithParameters(ctx, args);
    },

    queryFirst(...args: [Query<QueryParameter[]>] | QueryParameter[]) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);

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
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      let query: QueryInstance;

      if (isQuery(args)) {
        const queryRef = args;
        query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

        if (!query) {
          query = createQueryInstance(ctx, queryRef.parameters);
          ctx.queriesHashMap.set(queryRef.hash, query);
          if (queryRef.id >= ctx.queryInstances.length) {
            ctx.queryInstances.length = queryRef.id + 1;
          }
          ctx.queryInstances[queryRef.id] = query;
          query.refId = queryRef.id;
        }
      } else {
        const hash = createQueryHash(args as QueryParameter[]);
        query = ctx.queriesHashMap.get(hash)!;

        if (!query) {
          query = createQueryInstance(ctx, args as QueryParameter[]);
          ctx.queriesHashMap.set(hash, query);
        }
      }

      (query.addSubscriptions ??= new Set()).add(callback);

      return () => query.addSubscriptions!.delete(callback);
    },

    onExit(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      let query: QueryInstance;

      if (isQuery(args)) {
        const queryRef = args;
        query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

        if (!query) {
          query = createQueryInstance(ctx, queryRef.parameters);
          ctx.queriesHashMap.set(queryRef.hash, query);
          if (queryRef.id >= ctx.queryInstances.length) {
            ctx.queryInstances.length = queryRef.id + 1;
          }
          ctx.queryInstances[queryRef.id] = query;
          query.refId = queryRef.id;
        }
      } else {
        const hash = createQueryHash(args as QueryParameter[]);
        query = ctx.queriesHashMap.get(hash)!;

        if (!query) {
          query = createQueryInstance(ctx, args as QueryParameter[]);
          ctx.queriesHashMap.set(hash, query);
        }
      }

      (query.removeSubscriptions ??= new Set()).add(callback);

      return () => query.removeSubscriptions!.delete(callback);
    },

    onAdd(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      const resolvedTrait = resolveHookTrait(trait);
      const resolvedCallback = resolveHookCallback(ctx, trait, callback);

      let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

      if (!data) {
        registerTrait(ctx, resolvedTrait);
        data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
      }

      data.addSubscriptions.all.add(resolvedCallback);

      return () => data.addSubscriptions.all.delete(resolvedCallback);
    },

    onRemove(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      const resolvedTrait = resolveHookTrait(trait);
      const resolvedCallback = resolveHookCallback(ctx, trait, callback);

      let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

      if (!data) {
        registerTrait(ctx, resolvedTrait);
        data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
      }

      data.removeSubscriptions.all.add(resolvedCallback);

      return () => data.removeSubscriptions.all.delete(resolvedCallback);
    },

    onChange(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      const resolvedTrait = resolveHookTrait(trait);
      const resolvedCallback = resolveHookCallback(ctx, trait, callback);

      if (!hasTraitInstance(ctx.traitInstances, resolvedTrait)) registerTrait(ctx, resolvedTrait);

      const data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
      data.changeSubscriptions.all.add(resolvedCallback);

      return () => data.changeSubscriptions.all.delete(resolvedCallback);
    },

    onTransition(machine: Machine, callback: TransitionSubscriber) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return subscribeMachine(ctx, machine, callback);
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      ctx.entitySpawnSubscriptions.add(callback);
      return () => ctx.entitySpawnSubscriptions.delete(callback);
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      ctx.entityDestroySubscriptions.add(callback);
      return () => ctx.entityDestroySubscriptions.delete(callback);
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      ctx.traitRegisteredSubscriptions.add(callback);
      return () => ctx.traitRegisteredSubscriptions.delete(callback);
    },
  } as World;

  // Initialize entity index.
  world[$internal].entityIndex = createEntityIndex(addressSpace, world[$internal]);
  // Share ownedPages with the cleanup token so FR can reclaim pages.
  world[$internal].entityIndex.ownedPages = cleanupToken.ownedPages;

  // Register FR (only unobservable side effect of createWorld).
  addressSpace.worldFinalizer.register(world, cleanupToken, world);

  // Accessors are added after the literal. Redefining a literal data property
  // as a getter would drop the world into V8 dictionary mode.
  Object.defineProperty(world, 'retain', {
    get: () => world[$internal].retain,
    enumerable: true,
  });

  Object.defineProperty(world, 'traits', {
    get: () => world[$internal].traits,
    enumerable: true,
  });

  Object.defineProperty(world, 'id', {
    get: () => id,
    enumerable: true,
  });
  Object.defineProperty(world, 'isRegistered', {
    get: () => world[$internal].isRegistered,
    enumerable: true,
  });
  Object.defineProperty(world, 'entities', {
    get: () => getAliveEntities(world[$internal].entityIndex),
    enumerable: true,
  });

  return world;
}
