import { rethrowPublicError } from '../errors';
import {
  $internal,
  addTrait,
  createEntity,
  createKernelContext,
  createQueryHash,
  createQueryInstance,
  destroyKernel,
  flushCommands,
  getAliveEntities,
  getEntitiesWithRelationTo,
  getTrait,
  getTraitInstance,
  hasTrait,
  hasTraitInstance,
  isEntityAlive,
  isQuery,
  isRelationPair,
  registerTrait,
  removeTrait,
  resetKernel,
  setTrait,
} from '../../kernel';
import { createCommandBuffer, type CommandBuffer } from '../commands/command-buffer';
import '../entity/entity-methods-patch';
import type { Entity } from '../entity/types';
import { IsExcluded, runQueryResult } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { World } from './types';
import { worldFinalizer } from './finalization';
import { initializeWorld } from './lifecycle';
import { resolveHookCallback, resolveHookTrait } from './resolve-hook';

export function createWorld(...traits: ConfigurableTrait[]): World {
  const kernel = createKernelContext([IsExcluded]);
  const id = kernel.cleanupToken.contextId!;
  const cleanupToken = kernel.cleanupToken;

  const world = {
    [$internal]: {
      kernel,
      worldEntity: undefined,
      actionInstances: [],
      resetSubscriptions: new Set(),
    },

    traits: null! as Set<Trait>,

    createCommandBuffer() {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return createCommandBuffer(ctx, world[$internal].worldEntity!);
    },

    flush(...buffers: CommandBuffer[]) {
      try {
        flushCommands(world[$internal].kernel, ...buffers.map((buffer) => buffer[$internal]));
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return createEntity(ctx, ...spawnTraits) as Entity;
    },

    has(target: Entity | Trait): boolean {
      const ctx = world[$internal].kernel;
      if (!ctx.isRegistered) {
        if (typeof target === 'number') return false;
        return false;
      }
      return typeof target === 'number'
        ? isEntityAlive(ctx.entityIndex, target)
        : hasTrait(ctx, world[$internal].worldEntity!, target);
    },

    add(...addTraits: ConfigurableTrait[]) {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      addTrait(ctx, world[$internal].worldEntity!, ...addTraits);
    },

    remove(...removeTraits: Trait[]) {
      const ctx = world[$internal].kernel;
      if (!ctx.isRegistered) return;
      removeTrait(ctx, world[$internal].worldEntity!, ...removeTraits);
    },

    get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
      const ctx = world[$internal].kernel;
      if (!ctx.isRegistered) return undefined;
      return getTrait(ctx, world[$internal].worldEntity!, trait);
    },

    set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      setTrait(ctx, world[$internal].worldEntity!, trait, value, true);
    },

    destroy() {
      try {
        const ctx = world[$internal].kernel;
        const registered = ctx.isRegistered;
        destroyKernel(ctx);
        world[$internal].worldEntity = undefined;
        world[$internal].actionInstances.length = 0;
        if (registered) for (const sub of world[$internal].resetSubscriptions) sub();
        worldFinalizer.unregister(world);
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    reset() {
      try {
        const ctx = world[$internal].kernel;
        const registered = ctx.isRegistered;
        resetKernel(ctx);
        if (registered) world[$internal].worldEntity = createEntity(ctx, IsExcluded) as Entity;
        world[$internal].actionInstances.length = 0;
        if (registered) for (const sub of world[$internal].resetSubscriptions) sub();
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    query(...args: any[]) {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);

      if (args.length === 1 && isQuery(args[0])) {
        const queryRef = args[0];
        let query = ctx.queryInstances[queryRef.id];
        if (query) return runQueryResult(ctx, query, queryRef.parameters);

        query = ctx.queriesHashMap.get(queryRef.hash);
        if (!query) {
          query = createQueryInstance(ctx, queryRef.parameters);
          ctx.queriesHashMap.set(queryRef.hash, query);
          if (queryRef.id >= ctx.queryInstances.length) {
            ctx.queryInstances.length = queryRef.id + 1;
          }
          ctx.queryInstances[queryRef.id] = query;
        }
        return runQueryResult(ctx, query, queryRef.parameters);
      } else {
        const params = args as QueryParameter[];

        if (params.length === 1 && isRelationPair(params[0])) {
          const relation = params[0].relation;
          const target = params[0].target;

          // Only use fast path for specific targets
          if (!params[0].targetQuery && typeof target === 'number') {
            const entities = getEntitiesWithRelationTo(
              ctx,
              relation as Relation<Trait>,
              target as Entity
            );
            return createRelationOnlyQueryResult(entities as Entity[]);
          }
        }

        const hash = createQueryHash(params);
        let query = ctx.queriesHashMap.get(hash);

        if (!query) {
          query = createQueryInstance(ctx, params);
          ctx.queriesHashMap.set(hash, query);
        }

        return runQueryResult(ctx, query, params);
      }
    },

    queryFirst(...args: [string] | QueryParameter[]) {
      // @ts-expect-error
      return world.query(...args)[0];
    },

    onQueryAdd(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
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
        }
      } else {
        const hash = createQueryHash(args as QueryParameter[]);
        query = ctx.queriesHashMap.get(hash)!;

        if (!query) {
          query = createQueryInstance(ctx, args as QueryParameter[]);
          ctx.queriesHashMap.set(hash, query);
        }
      }

      query.addSubscriptions.add(callback as (entity: number) => void);

      return () => query.addSubscriptions.delete(callback as (entity: number) => void);
    },

    onQueryRemove(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
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
        }
      } else {
        const hash = createQueryHash(args as QueryParameter[]);
        query = ctx.queriesHashMap.get(hash)!;

        if (!query) {
          query = createQueryInstance(ctx, args as QueryParameter[]);
          ctx.queriesHashMap.set(hash, query);
        }
      }

      query.removeSubscriptions.add(callback as (entity: number) => void);

      return () => query.removeSubscriptions.delete(callback as (entity: number) => void);
    },

    onAdd<T extends Trait>(
      trait: T | Relation<T> | RelationPair<T>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
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
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
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
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      const resolvedTrait = resolveHookTrait(trait);
      const resolvedCallback = resolveHookCallback(ctx, trait, callback);

      if (!hasTraitInstance(ctx.traitInstances, resolvedTrait)) registerTrait(ctx, resolvedTrait);

      const data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
      data.changeSubscriptions.all.add(resolvedCallback);

      return () => data.changeSubscriptions.all.delete(resolvedCallback);
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      const resolved = (entity: number) => {
        if (!hasTrait(ctx, entity, IsExcluded)) callback(entity as Entity);
      };
      ctx.entitySpawnSubscriptions.add(resolved);
      return () => ctx.entitySpawnSubscriptions.delete(resolved);
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      const state = world[$internal];
      const resolved = (entity: number) => {
        if (entity !== state.worldEntity) callback(entity as Entity);
      };
      ctx.entityDestroySubscriptions.add(resolved);
      return () => ctx.entityDestroySubscriptions.delete(resolved);
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      ctx.traitRegisteredSubscriptions.add(
        callback as (trait: import('../../kernel/trait/types').Trait) => void
      );
      return () =>
        ctx.traitRegisteredSubscriptions.delete(
          callback as (trait: import('../../kernel/trait/types').Trait) => void
        );
    },
  } as unknown as World;

  // Register FR (only unobservable side effect of createWorld).
  worldFinalizer.register(world, cleanupToken, world);

  Object.defineProperty(world, 'traits', {
    get: () => world[$internal].kernel.traits,
    enumerable: true,
  });

  Object.defineProperty(world, 'id', {
    get: () => id,
    enumerable: true,
  });

  Object.defineProperty(world, 'isRegistered', {
    get: () => world[$internal].kernel.isRegistered,
    enumerable: true,
  });

  Object.defineProperty(world, 'entities', {
    get: () => getAliveEntities(world[$internal].kernel.entityIndex),
    enumerable: true,
  });

  // Auto-register when traits are passed. No-arg createWorld() stays pure.
  if (traits.length > 0) {
    initializeWorld(world[$internal], traits);
  }

  return world;
}
