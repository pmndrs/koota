import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { createEntity, destroyEntity } from '../entity/entity';
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
import { findNamedEntity } from '../name/find-named-entity';
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
import { getEntitiesWithRelationTo, getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
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
import { resolveHookCallback, resolveHookTrait } from './utils/resolve-hook';

let nextWorldId = 0;

/** Options come first and are the only plain object a world accepts, traits are functions or tuples. */
function isWorldOptions(arg: WorldOptions | ConfigurableTrait): arg is WorldOptions {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !isRelationPair(arg);
}

/** Registers IsExcluded and creates the world entity on first mutation. */
function ensureWorldRegistered(ctx: WorldContext): void {
  if (ctx.isRegistered) return;
  ctx.isRegistered = true;
  if (ctx.cleanupToken) ctx.cleanupToken.registered = true;

  if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(ctx, IsExcluded);

  const pending = ctx.pendingTraits;
  ctx.pendingTraits = undefined;
  ctx.worldEntity = createEntity(ctx, [IsExcluded, ...(pending || [])]);
}

/** Resolve inline parameters, including direct relation and named lookups. */
export function queryWithParameters(ctx: WorldContext, params: QueryParameter[]) {
  if (params.length === 1 && isRelationPair(params[0])) {
    const relation = params[0].relation;
    const target = params[0].target;
    if (!params[0].targetQuery && typeof target === 'number') {
      const entities = getEntitiesWithRelationTo(ctx, relation as Relation<Trait>, target as Entity);
      return createOwnedView(ctx, entities as Entity[], null, params);
    }
  }

  const named = findNamedEntity(ctx, params);
  if (named !== null) {
    return createOwnedView(ctx, named === undefined ? [] : [named], null, params);
  }

  const hash = createQueryHash(params);
  let query = ctx.queriesHashMap.get(hash);
  if (!query) {
    query = createQueryInstance(ctx, params);
    ctx.queriesHashMap.set(hash, query);
  }
  return runQuery(ctx, query, params);
}

export function createWorld(options: WorldOptions, ...traits: ConfigurableTrait[]): World;
export function createWorld(...traits: ConfigurableTrait[]): World;
export function createWorld(...args: (WorldOptions | ConfigurableTrait)[]): World {
  const id = nextWorldId++;
  let retain = 1024;
  if (args.length !== 0 && isWorldOptions(args[0])) {
    retain = args[0].retain ?? retain;
    args = args.slice(1);
  }
  const traits = args as ConfigurableTrait[];
  const pendingTraits = traits.length > 0 ? traits : undefined;

  const cleanupToken: PageCleanupToken = {
    ownedPages: [],
    registered: false,
  };

  const world = {
    [$internal]: {
      entityIndex: null! as ReturnType<typeof createEntityIndex>,
      entityMasks: [createEmptyMaskGeneration()],
      retainedMasks: [0],
      tombstones: new Int32Array(retain),
      tombstoneSerials: new Float64Array(retain),
      tombstoneHead: 0,
      tombstoneCount: 0,
      destroySerial: 0,
      retainingQueries: [],
      names: new Map(),
      bitflag: 1,
      traitInstances: [],
      traitsByBit: [[]],
      traits: new Set<Trait>(),
      relations: [],
      queriesHashMap: new Map(),
      queryInstances: [],
      iterationBuffers: undefined,
      actionInstances: [],
      notQueries: [],
      queryCallbackDepth: 0,
      targetQueries: [],
      dirtyQueries: new Set(),
      worldEntity: null!,
      entitySubscribedInstances: new Set(),
      resetSubscriptions: new Set(),
      entitySpawnSubscriptions: new Set(),
      entityDestroySubscriptions: new Set(),
      traitRegisteredSubscriptions: new Set(),
      isRegistered: false,
      pendingTraits,
      cleanupToken,
      ...(assertsEnabled ? { structuralRevision: 0 } : {}),
    } as WorldContext,

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return createEntity(ctx, spawnTraits);
    },

    lookup(name: string): Entity | undefined {
      return world[$internal].names.get(name);
    },

    has(target: Entity | Trait): boolean {
      const ctx = world[$internal];
      if (!ctx.isRegistered) {
        if (typeof target === 'number') return false;
        return false;
      }
      return typeof target === 'number'
        ? isEntityAlive(ctx.entityIndex, target)
        : hasTrait(ctx, ctx.worldEntity, target);
    },

    add(...addTraits: ConfigurableTrait[]) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      addTrait(ctx, ctx.worldEntity, ...addTraits);
    },

    remove(...removeTraits: Trait[]) {
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
      ctx.pendingTraits = undefined;

      world.entities.forEach((entity) => {
        if (isEntityAlive(ctx.entityIndex, entity)) {
          destroyEntity(ctx, entity);
        }
      });

      releaseOwnedPages(ctx.entityIndex);
      ctx.entityIndex = createEntityIndex(addressSpace, ctx);
      // Re-link shared ownedPages for the cleanup token.
      ctx.entityIndex.ownedPages = cleanupToken.ownedPages;

      ctx.names.clear();
      ctx.entityMasks = [createEmptyMaskGeneration()];
      ctx.retainedMasks = [0];
      ctx.traitsByBit = [[]];
      ctx.bitflag = 1;

      for (const query of ctx.queriesHashMap.values()) {
        if (query.cleanup === null) continue;
        for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
      }

      clearTraitInstance(ctx.traitInstances);
      ctx.traits.clear();
      ctx.relations.length = 0;

      ctx.queriesHashMap.clear();
      ctx.queryInstances.length = 0;
      ctx.retainingQueries.length = 0;
      ctx.tombstoneHead = 0;
      ctx.tombstoneCount = 0;
      ctx.iterationBuffers = undefined;
      ctx.actionInstances.length = 0;
      ctx.dirtyQueries.clear();
      ctx.notQueries.length = 0;
      ctx.targetQueries.length = 0;

      ctx.entitySubscribedInstances.clear();

      ctx.worldEntity = createEntity(ctx, [IsExcluded]);

      for (const sub of ctx.resetSubscriptions) {
        sub();
      }
    },

    emit(...traits: ConfigurableTrait[]) {
      const ctx = world[$internal];
      if (ctx.tombstones.length === 0) {
        throw new Error(
          'Koota: [EMIT_RETAIN] world.emit needs a world that retains destroyed entities. Create it without retain: 0.'
        );
      }
      ensureWorldRegistered(ctx);
      destroyEntity(ctx, createEntity(ctx, traits));
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

      const named = findNamedEntity(ctx, args as QueryParameter[]);
      if (named !== null) return named;

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

    onAdd<T extends Trait>(
      trait: T | Relation<T> | RelationPair<T>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
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

    onRemove<T extends Trait>(
      trait: T | Relation<T> | RelationPair<T>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
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

    onChange(
      trait: Trait | Relation<Trait> | RelationPair<Trait>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
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

  // Auto-register when traits are passed. No-arg createWorld() stays pure.
  if (pendingTraits) {
    ensureWorldRegistered(world[$internal]);
  }

  return world;
}
