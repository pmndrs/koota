import { collect, first, getEntities, subscribeQuery } from '../../kernel';
import { createCommandBuffer, type CommandBuffer } from '../commands/command-buffer';
import '../entity/entity-methods-patch';
import type { Entity } from '../entity/types';
import { rethrowPublicError } from '../errors';
import { createOwnerState, isHandleAlive, registry, resolveOwner, toPublic } from '../handles';
import { hashParameters, IsExcluded, isQuery, resolveQuery } from '../query/query';
import { createQueryResult, emptyResult } from '../query/query-result';
import type { Query, QueryParameter, QueryUnsubscriber } from '../query/types';
import { isRelation } from '../relation/relation';
import type { Relation } from '../relation/types';
import { $internal } from '../symbols';
import type { ConfigurableTrait, ExtractSchema, SetTraitCallback, Trait, TraitRecord, TraitValue } from '../trait/types';
import { worldFinalizer } from './finalization';
import {
  addToEntity,
  destroyState,
  ensureKernel,
  entityHas,
  flushBuffers,
  readTrait,
  registerTrait,
  removeFromEntity,
  resetState,
  setOnEntity,
  spawnEntity,
} from './lifecycle';
import type { WorldState } from './state';
import { resolveHookTrait, subscribeTrait, type HookInput } from './subscriptions';
import type { World } from './types';

export function createWorld(...traits: ConfigurableTrait[]): World {
  const id = registry.nextWorldId++;
  const state = {
    id,
    worldRef: null! as WeakRef<World>,
    kernel: null,
    epoch: 0,
    worldEntity: undefined,
    initialTraits: traits,
    actionInstances: [],
    resetSubscriptions: new Set<() => void>(),
    traits: new Set<Trait>(),
    traitRegisteredSubscribers: new Set<(trait: Trait) => void>(),
    spawnSubscribers: new Set<(entity: Entity) => void>(),
    destroySubscribers: new Set<(entity: Entity) => void>(),
    traitSubscriptions: new Map(),
    traitObserversAttached: false,
    versionSources: new Map(),
    queries: new Map(),
    definitionEntities: new Map(),
    hidden: new Set<Entity>(),
    ...createOwnerState(),
  } as WorldState;

  const world = {
    [$internal]: state,

    createCommandBuffer(): CommandBuffer {
      ensureKernel(state);
      return createCommandBuffer(state, state.worldEntity!);
    },

    flush(...buffers: CommandBuffer[]) {
      try {
        flushBuffers(state, buffers);
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      return spawnEntity(state, spawnTraits);
    },

    entity(definition: Trait | Relation<Trait>): Entity {
      ensureKernel(state);
      const existing = state.definitionEntities.get(definition);
      if (existing !== undefined && resolveOwner(existing) === state) return existing;
      registerTrait(state, isRelation(definition) ? definition[$internal].trait : definition);
      const entity = spawnEntity(state, [IsExcluded]);
      state.definitionEntities.set(definition, entity);
      state.hidden.add(entity);
      return entity;
    },

    has(target: Entity | Trait): boolean {
      if (!state.kernel) return false;
      if (typeof target === 'number') return isHandleAlive(target);
      return entityHas(state, state.worldEntity!, target);
    },

    add(...traits: ConfigurableTrait[]) {
      ensureKernel(state);
      addToEntity(state, state.worldEntity!, traits);
    },

    remove(...traits: Trait[]) {
      if (!state.kernel) return;
      removeFromEntity(state, state.worldEntity!, traits);
    },

    get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
      if (!state.kernel) return undefined;
      return readTrait(state, state.worldEntity!, trait) as TraitRecord<ExtractSchema<T>> | undefined;
    },

    set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
      ensureKernel(state);
      setOnEntity(state, state.worldEntity!, trait, value, true);
    },

    destroy() {
      try {
        destroyState(state);
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    reset() {
      try {
        resetState(state);
      } catch (error) {
        rethrowPublicError(error);
      }
    },

    query(...args: unknown[]) {
      ensureKernel(state);
      const [parameters, hash] = queryInput(args);
      const query = resolveQuery(state, parameters, hash);
      if (query === null) return emptyResult;
      const entities = collect(state.kernel!, query) as unknown as Entity[];
      if (entities.length === 0) return emptyResult;
      const localToPublic = state.localToPublic;
      for (let i = 0; i < entities.length; i++) entities[i] = localToPublic[(entities[i] as number) & 0x1fffff] as Entity;
      return createQueryResult(state, entities, query, parameters);
    },

    queryFirst(...args: unknown[]) {
      ensureKernel(state);
      const [parameters, hash] = queryInput(args);
      const query = resolveQuery(state, parameters, hash);
      if (query === null) return undefined;
      if (query.dynamic) {
        const entities = collect(state.kernel!, query);
        return entities.length === 0 ? undefined : toPublic(state, entities[0]);
      }
      const local = first(state.kernel!, query);
      return local === undefined ? undefined : toPublic(state, local);
    },

    onQueryAdd(args: Query<QueryParameter[]> | QueryParameter[], callback: (entity: Entity) => void): QueryUnsubscriber {
      return subscribeQueryEvent(state, args, 'add', callback);
    },

    onQueryRemove(args: Query<QueryParameter[]> | QueryParameter[], callback: (entity: Entity) => void): QueryUnsubscriber {
      return subscribeQueryEvent(state, args, 'remove', callback);
    },

    onAdd(input: HookInput, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber {
      return subscribeWorldTrait(state, input, 'add', callback);
    },

    onRemove(input: HookInput, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber {
      return subscribeWorldTrait(state, input, 'remove', callback);
    },

    onChange(input: HookInput, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber {
      return subscribeWorldTrait(state, input, 'change', callback);
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      state.spawnSubscribers.add(callback);
      return () => {
        state.spawnSubscribers.delete(callback);
      };
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      state.destroySubscribers.add(callback);
      return () => {
        state.destroySubscribers.delete(callback);
      };
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      state.traitRegisteredSubscribers.add(callback);
      return () => {
        state.traitRegisteredSubscribers.delete(callback);
      };
    },
  } as unknown as World;

  state.worldRef = new WeakRef(world);
  worldFinalizer.register(world, { id, owner: state }, world);

  Object.defineProperty(world, 'traits', { get: () => state.traits, enumerable: true });
  Object.defineProperty(world, 'id', { get: () => id, enumerable: true });
  Object.defineProperty(world, 'isRegistered', { get: () => state.kernel !== null, enumerable: true });
  Object.defineProperty(world, 'entities', {
    get: () => {
      if (!state.kernel) return [];
      const locals = getEntities(state.kernel);
      const result: Entity[] = [];
      for (let i = 0; i < locals.length; i++) {
        const entity = toPublic(state, locals[i]);
        if (!state.hidden.has(entity)) result.push(entity);
      }
      return result;
    },
    enumerable: true,
  });

  if (traits.length > 0) ensureKernel(state);
  return world;
}

function queryInput(args: unknown[]): [readonly QueryParameter[], string | undefined] {
  if (args.length === 1 && isQuery(args[0])) return [args[0].parameters, args[0].hash];
  return [args as QueryParameter[], undefined];
}

function subscribeWorldTrait(
  state: WorldState,
  input: HookInput,
  event: 'add' | 'remove' | 'change',
  callback: (entity: Entity, target?: Entity) => void
): QueryUnsubscriber {
  ensureKernel(state);
  registerTrait(state, resolveHookTrait(input));
  return subscribeTrait(state, input, event, callback);
}

function subscribeQueryEvent(
  state: WorldState,
  args: Query<QueryParameter[]> | QueryParameter[],
  event: 'add' | 'remove',
  callback: (entity: Entity) => void
): QueryUnsubscriber {
  ensureKernel(state);
  const parameters = isQuery(args) ? args.parameters : args;
  const query = resolveQuery(state, parameters, isQuery(args) ? args.hash : hashParameters(parameters));
  if (query === null) return () => {};
  return subscribeQuery(state.kernel!, query, event, (local) => callback(toPublic(state, local)));
}
