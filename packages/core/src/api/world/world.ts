import { rethrowPublicError } from '../errors';
import {
  $internal,
  resolveDefinition,
  pairEntity,
  resolveQuery,
  subscribeQuery,
  subscribeTrait,
  subscribeEntityLifecycle,
  subscribeTraitRegistered,
  getKernelId,
  getKernelCleanupToken,
  isKernelInitialized,
  getKernelTraits,
  getKernelEntities,
  hasEntity,
  queryRelation,
  addTrait,
  createEntity,
  createKernelContext,
  destroyKernel,
  flushCommands,
  getTrait,
  hasTrait,
  isQuery,
  isRelationPair,
  removeTrait,
  resetKernel,
  setTrait,
} from '../../kernel';
import { createCommandBuffer, type CommandBuffer } from '../commands/command-buffer';
import '../entity/entity-methods-patch';
import type { Entity } from '../entity/types';
import { IsExcluded, runQueryResult } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type { Query, QueryParameter, QueryUnsubscriber } from '../query/types';
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
  const id = getKernelId(kernel);
  const cleanupToken = getKernelCleanupToken(kernel);

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

    entity(definition: Trait | Relation<Trait> | RelationPair): Entity {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      if (isRelationPair(definition)) {
        if (typeof definition.target !== 'number')
          throw new Error('Koota: Expected a concrete pair.');
        return pairEntity(
          ctx,
          resolveDefinition(ctx, definition.relation),
          definition.target
        ) as Entity;
      }
      return resolveDefinition(ctx, definition) as Entity;
    },

    has(target: Entity | Trait): boolean {
      const ctx = world[$internal].kernel;
      if (!isKernelInitialized(ctx)) return false;
      return typeof target === 'number'
        ? hasEntity(ctx, target)
        : hasTrait(ctx, world[$internal].worldEntity!, target);
    },

    add(...addTraits: ConfigurableTrait[]) {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      addTrait(ctx, world[$internal].worldEntity!, ...addTraits);
    },

    remove(...removeTraits: Trait[]) {
      const ctx = world[$internal].kernel;
      if (!isKernelInitialized(ctx)) return;
      removeTrait(ctx, world[$internal].worldEntity!, ...removeTraits);
    },

    get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
      const ctx = world[$internal].kernel;
      if (!isKernelInitialized(ctx)) return undefined;
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
        const registered = isKernelInitialized(ctx);
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
        const registered = isKernelInitialized(ctx);
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
        return runQueryResult(ctx, resolveQuery(ctx, args[0]), args[0].parameters);
      }
      const params = args as QueryParameter[];
      if (
        params.length === 1 &&
        isRelationPair(params[0]) &&
        !params[0].targetQuery &&
        typeof params[0].target === 'number'
      ) {
        return createRelationOnlyQueryResult(queryRelation(ctx, params[0]) as Entity[]);
      }
      return runQueryResult(ctx, resolveQuery(ctx, params), params);
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
      return subscribeQuery(ctx, args, 'add', callback as (entity: number) => void);
    },

    onQueryRemove(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return subscribeQuery(ctx, args, 'remove', callback as (entity: number) => void);
    },

    onAdd<T extends Trait>(
      trait: T | Relation<T> | RelationPair<T>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return subscribeTrait(
        ctx,
        resolveHookTrait(trait),
        'add',
        resolveHookCallback(ctx, trait, callback)
      );
    },

    onRemove<T extends Trait>(
      trait: T | Relation<T> | RelationPair<T>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return subscribeTrait(
        ctx,
        resolveHookTrait(trait),
        'remove',
        resolveHookCallback(ctx, trait, callback)
      );
    },

    onChange(
      trait: Trait | Relation<Trait> | RelationPair<Trait>,
      callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      initializeWorld(world[$internal]);
      return subscribeTrait(
        ctx,
        resolveHookTrait(trait),
        'change',
        resolveHookCallback(ctx, trait, callback)
      );
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      const resolved = (entity: number) => {
        if (!hasTrait(ctx, entity, IsExcluded)) callback(entity as Entity);
      };
      return subscribeEntityLifecycle(ctx, 'spawn', resolved);
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      const state = world[$internal];
      const resolved = (entity: number) => {
        if (entity !== state.worldEntity) callback(entity as Entity);
      };
      return subscribeEntityLifecycle(ctx, 'destroy', resolved);
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      const ctx = world[$internal].kernel;
      return subscribeTraitRegistered(ctx, callback);
    },
  } as unknown as World;

  // Register FR (only unobservable side effect of createWorld).
  worldFinalizer.register(world, cleanupToken, world);

  Object.defineProperty(world, 'traits', {
    get: () => getKernelTraits(world[$internal].kernel),
    enumerable: true,
  });

  Object.defineProperty(world, 'id', {
    get: () => id,
    enumerable: true,
  });

  Object.defineProperty(world, 'isRegistered', {
    get: () => isKernelInitialized(world[$internal].kernel),
    enumerable: true,
  });

  Object.defineProperty(world, 'entities', {
    get: () => getKernelEntities(world[$internal].kernel),
    enumerable: true,
  });

  // Auto-register when traits are passed. No-arg createWorld() stays pure.
  if (traits.length > 0) {
    initializeWorld(world[$internal], traits);
  }

  return world;
}
