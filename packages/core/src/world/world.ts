import { $internal } from '../common';
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
import { sameParams } from '../query/utils/same-params';
import { getEntitiesWithRelationTo, getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { clearTraitInstance, getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { World, WorldContext, WorldOptions } from './types';
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
  // A pair naming a target entity is a new object on every call, so no list is kept under it.
  if (isRelationPair(first) && typeof first.target === 'number') {
    if (params.length === 1) {
      const entities = getEntitiesWithRelationTo(
        ctx,
        first.relation as Relation<Trait>,
        first.target
      );
      return createOwnedView(ctx, entities as Entity[], null, params);
    }
    return resolveInlineQuery(ctx, params);
  }

  const known = ctx.inlineQueries.get(first);
  if (known !== undefined) {
    for (let i = 0; i < known.length; i++) {
      const entry = known[i];
      if (sameParams(entry.params, params)) return runQuery(ctx, entry.query, entry.params);
    }
  }
  return resolveInlineQuery(ctx, params);
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
  // Pairs and modifiers trail the traits, so the last entry settles most lists that cannot be kept.
  if (isStableParameter(params[params.length - 1])) rememberInlineQuery(ctx, params, query);
  return runQuery(ctx, query, params);
}

/**
 * Lists a query under parameters that are the same objects on every call. Only a query naming a
 * target entity is ever dropped, and its pair is never stable, so a listed query stays valid.
 */
function rememberInlineQuery(ctx: WorldContext, params: QueryParameter[], query: QueryInstance) {
  if (!params.every(isStableParameter)) return;
  const known = ctx.inlineQueries.get(params[0]);
  if (known === undefined) ctx.inlineQueries.set(params[0], [{ params, query }]);
  else known.push({ params, query });
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
      inlineQueries: new Map(),
      queryInstances: [],
      iterationBuffers: undefined,
      actionInstances: [],
      notQueries: [],
      queryCallbackDepth: 0,
      defersChanges: false,
      targetQueries: [],
      dirtyQueries: [],
      worldEntity: null!,
      entitySubscribedInstances: new Set(),
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
      addTrait(ctx, ctx.worldEntity, ...addTraits);
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
        destroyEntity(ctx, ctx.worldEntity);
        ctx.worldEntity = null!;
        world.reset();
      }
      ctx.isRegistered = false;
      addressSpace.worldFinalizer.unregister(world);
    },

    reset() {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;

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
        if (query.cleanup === null) continue;
        for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
      }

      clearTraitInstance(ctx.traitInstances);
      ctx.traits.clear();
      ctx.relations.length = 0;

      ctx.queriesHashMap.clear();
      ctx.inlineQueries.clear();
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

      const identified = findIdentifiedEntity(ctx, args as QueryParameter[]);
      if (identified !== null) return identified;

      return runQueryFirst(ctx, resolveQueryInstance(ctx, args as QueryParameter[]));
    },

    onQueryAdd(
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

    onQueryRemove(
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
