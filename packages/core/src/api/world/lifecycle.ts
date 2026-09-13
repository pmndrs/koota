import {
  abortMutation,
  addTrait,
  addTraitNow,
  addTraits,
  addTraitsNow,
  Any,
  beginMutation,
  createReserved,
  createReservedNow,
  createWorld as createKernel,
  destroyEntity,
  destroyEntityNow,
  destroyWorld as destroyKernel,
  endMutation,
  entityInQuery,
  getTraitUnchecked,
  getTargets,
  hasTraitUnchecked,
  markChanged,
  markChangedNow,
  pair,
  removeTrait,
  removeTraitNow,
  reserveEntity,
  resetWorld as resetKernel,
  setTraitUnchecked,
  setTraitUncheckedNow,
  type EntityEntry,
  type TypeId,
} from '../../kernel';
import { clearCommands, type CommandBuffer, type CommandBufferState } from '../commands/command-buffer';
import type { Entity } from '../entity/types';
import { createInternalError } from '../errors';
import { allocateHandle, handleIndex, registry, releasePages, releaseReserved, toLocal } from '../handles';
import { IsExcluded, isQuery, resolveQuery } from '../query/query';
import { isRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { $internal } from '../symbols';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { worldFinalizer } from './finalization';
import { CommandKind, type Command, type WorldState } from './state';
import { attachObservers, attachTraitObservers } from './subscriptions';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTrait(state: WorldState, trait: Trait): void {
  if (state.traits.has(trait)) return;
  state.traits.add(trait);
  for (const subscriber of state.traitRegisteredSubscribers) subscriber(trait);
}

/** Creates the kernel on first use and spawns the world entity. */
export function ensureKernel(state: WorldState): void {
  if (state.kernel) return;
  const kernel = createKernel({ exclude: [IsExcluded[$internal].id] });
  state.kernel = kernel;
  kernel.context = state;
  registry.worlds[state.id] = state;
  attachObservers(state, kernel);
  if (state.traitSubscriptions.size > 0) attachTraitObservers(state, kernel);
  state.worldEntity = spawnEntity(state, [IsExcluded]);
  if (state.initialTraits.length > 0) {
    const traits = state.initialTraits;
    state.initialTraits = [];
    addToEntity(state, state.worldEntity, traits);
  }
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** Translates public trait configuration into kernel entries. Dead pair targets are dropped. */
function toEntries(state: WorldState, traits: readonly ConfigurableTrait[]): EntityEntry[] {
  const entries: EntityEntry[] = [];
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    if (isRelationPair(config)) {
      if (typeof config.target !== 'number') continue;
      const target = toLocal(state, config.target);
      if (target === 0) continue;
      registerTrait(state, config.relation[$internal].trait);
      entries.push([pair(config.relation[$internal].id, target), config.params]);
      continue;
    }
    const trait = Array.isArray(config) ? config[0] : config;
    const value = Array.isArray(config) ? config[1] : undefined;
    registerTrait(state, trait);
    const internal = trait[$internal];
    entries.push(value === undefined ? internal.id : [internal.id, value]);
  }
  return entries;
}

function observed(state: WorldState, traits: readonly ConfigurableTrait[]): boolean {
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    const trait = isRelationPair(config) ? config.relation[$internal].trait : Array.isArray(config) ? config[0] : config;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions && (subscriptions.add.size > 0 || subscriptions.byEntity.size > 0)) return true;
  }
  return false;
}

/** Kernel type for a trait or pair, or 0 when a pair targets a dead entity. */
function resolveType(state: WorldState, input: Trait | RelationPair): TypeId {
  if (isRelationPair(input)) {
    const relation = input.relation[$internal].id;
    if (input.target === '*') return pair(relation, Any);
    if (typeof input.target !== 'number') return 0;
    const target = toLocal(state, input.target);
    return target === 0 ? 0 : pair(relation, target);
  }
  return input[$internal].id;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
//
// Every operation has an immediate form, used inside a mutation scope this
// layer opened, and a deferring form that goes through the kernel's own entry
// points, which queue while a mutation is running. Hook and observer work
// always queues in the kernel and plays when the outermost scope closes.

/** Adds traits one by one when anyone observes them, otherwise in one transition. */
function addConfigs(state: WorldState, entity: Entity, traits: readonly ConfigurableTrait[], now: boolean): void {
  const local = toLocal(state, entity);
  if (local === 0) return;
  const kernel = state.kernel!;
  const entries = toEntries(state, traits);
  if (entries.length === 0) return;
  if (entries.length === 1 || observed(state, traits)) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      const value = typeof entry === 'number' ? undefined : entry[1];
      if (now) addTraitNow(kernel, local, type, value);
      else addTrait(kernel, local, type, value);
    }
    return;
  }
  if (now) addTraitsNow(kernel, local, entries);
  else addTraits(kernel, local, entries);
}

function removeConfigs(state: WorldState, entity: Entity, traits: readonly (Trait | RelationPair)[], now: boolean): void {
  const local = toLocal(state, entity);
  if (local === 0) return;
  const kernel = state.kernel!;
  for (let i = 0; i < traits.length; i++) {
    const type = resolveType(state, traits[i]);
    if (type === 0) continue;
    if (now) removeTraitNow(kernel, local, type);
    else removeTrait(kernel, local, type);
  }
}

function setConfig(
  state: WorldState,
  entity: Entity,
  input: Trait | RelationPair,
  value: unknown,
  notify: boolean,
  now: boolean,
  local = toLocal(state, entity)
): void {
  if (local === 0) return;
  const type = resolveType(state, input);
  if (type === 0) return;
  if (now) setTraitUncheckedNow(state.kernel!, local, type, value, notify);
  else setTraitUnchecked(state.kernel!, local, type, value, notify);
}

function changedConfig(state: WorldState, entity: Entity, trait: Trait, target: Entity | undefined, now: boolean): void {
  const local = toLocal(state, entity);
  if (local === 0) return;
  const relation = trait[$internal].relation;
  let type: TypeId = trait[$internal].id;
  if (relation) {
    if (target === undefined) {
      type = pair(relation[$internal].id, Any);
    } else {
      const localTarget = toLocal(state, target);
      if (localTarget === 0) return;
      type = pair(relation[$internal].id, localTarget);
    }
  }
  if (now) markChangedNow(state.kernel!, local, type);
  else markChanged(state.kernel!, local, type);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function spawnEntity(state: WorldState, traits: readonly ConfigurableTrait[]): Entity {
  ensureKernel(state);
  const kernel = state.kernel!;
  const local = reserveEntity(kernel);
  const entity = allocateHandle(state, local);
  const entries = traits.length > 0 ? toEntries(state, traits) : undefined;
  // Inside a mutation the reservation outlives this call, so reset can release its handle.
  if (kernel.depth > 0) state.reserved.add(handleIndex(entity));
  createReserved(kernel, local, entries !== undefined && entries.length > 0 ? entries : undefined);
  return entity;
}

export function addToEntity(state: WorldState, entity: Entity, traits: readonly ConfigurableTrait[]): void {
  ensureKernel(state);
  const kernel = state.kernel!;
  if (kernel.depth > 0) {
    addConfigs(state, entity, traits, false);
    return;
  }
  beginMutation(kernel);
  try {
    addConfigs(state, entity, traits, true);
  } catch (error) {
    abortMutation(kernel);
    throw error;
  }
  endMutation(kernel);
}

export function removeFromEntity(state: WorldState, entity: Entity, traits: readonly (Trait | RelationPair)[]): void {
  const kernel = state.kernel;
  if (!kernel) return;
  if (kernel.depth > 0) {
    removeConfigs(state, entity, traits, false);
    return;
  }
  beginMutation(kernel);
  try {
    removeConfigs(state, entity, traits, true);
  } catch (error) {
    abortMutation(kernel);
    throw error;
  }
  endMutation(kernel);
}

export function setOnEntity(
  state: WorldState,
  entity: Entity,
  input: Trait | RelationPair,
  value: unknown,
  triggerChanged: boolean,
  local = 0
): void {
  ensureKernel(state);
  setConfig(state, entity, input, value, triggerChanged, false, local === 0 ? toLocal(state, entity) : local);
}

export function changedOnEntity(state: WorldState, entity: Entity, trait: Trait, target?: Entity): void {
  ensureKernel(state);
  changedConfig(state, entity, trait, target, false);
}

export function destroyPublicEntity(state: WorldState, entity: Entity): void {
  const kernel = state.kernel;
  if (!kernel) return;
  const local = toLocal(state, entity);
  if (local !== 0) destroyEntity(kernel, local);
}

// ---------------------------------------------------------------------------
// Flushing
// ---------------------------------------------------------------------------

/** Plays one recorded command inside the flush's mutation scope. */
function play(state: WorldState, command: Command): void {
  const kernel = state.kernel!;
  switch (command.kind) {
    case CommandKind.Spawn: {
      const local = toLocal(state, command.entity);
      if (local === 0) return;
      const traits = command.operand as ConfigurableTrait[];
      const entries = traits.length > 0 ? toEntries(state, traits) : undefined;
      createReservedNow(kernel, local, entries !== undefined && entries.length > 0 ? entries : undefined);
      break;
    }
    case CommandKind.Destroy: {
      const local = toLocal(state, command.entity);
      if (local !== 0) destroyEntityNow(kernel, local);
      break;
    }
    case CommandKind.Add:
      addConfigs(state, command.entity, [command.operand as ConfigurableTrait], true);
      break;
    case CommandKind.Remove:
      removeConfigs(state, command.entity, [command.operand as Trait | RelationPair], true);
      break;
    case CommandKind.Set:
      setConfig(state, command.entity, command.operand as Trait | RelationPair, command.value, command.flag, true);
      break;
    case CommandKind.Changed:
      changedConfig(state, command.entity, command.operand as Trait, command.value as Entity | undefined, true);
      break;
  }
}

export function flushBuffers(state: WorldState, buffers: CommandBuffer[]): void {
  const current = state.kernel;
  if (current !== null && (current.depth > 0 || current.flushing)) throw createInternalError('FLUSH_DURING_MUTATION');
  const states: CommandBufferState[] = buffers.map((buffer) => buffer[$internal]);
  for (let i = 0; i < states.length; i++) {
    if (states[i].state !== state) throw createInternalError('BUFFER_CONTEXT_MISMATCH');
    if (states[i].epoch !== state.epoch) throw createInternalError('BUFFER_CONTEXT_EXPIRED');
    if (states.indexOf(states[i]) !== i) throw createInternalError('BUFFER_DUPLICATED');
  }
  ensureKernel(state);
  const kernel = state.kernel!;
  for (const buffer of states) buffer.playing = true;
  // One scope covers every buffer, so callback work plays after the supplied commands.
  beginMutation(kernel);
  let failed = false;
  try {
    try {
      for (const buffer of states) {
        const commands = buffer.commands;
        for (let i = 0; i < commands.length; i++) {
          try {
            play(state, commands[i]);
          } catch (error) {
            commands.splice(0, i + 1);
            throw error;
          }
        }
        commands.length = 0;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (failed) abortMutation(kernel);
      else endMutation(kernel);
    }
  } finally {
    for (const buffer of states) {
      buffer.playing = false;
      clearCommands(buffer);
    }
  }
}

// ---------------------------------------------------------------------------
// Reset and destroy
// ---------------------------------------------------------------------------

function clearState(state: WorldState): void {
  releaseReserved(state);
  // Hand out recycled indices in ascending order again after a reset.
  state.free.sort((a, b) => b - a);
  state.queries.clear();
  state.versionSources.clear();
  state.definitionEntities.clear();
  state.hidden.clear();
  state.actionInstances.length = 0;
  state.traits.clear();
  // Trait subscriptions belong to a registration and end with it. Entity lifecycle subscribers survive.
  state.traitSubscriptions.clear();
  state.epoch++;
}

export function resetState(state: WorldState): void {
  const kernel = state.kernel;
  if (kernel !== null && (kernel.depth > 0 || kernel.flushing)) throw createInternalError('CONTEXT_RESET_DURING_MUTATION');
  if (kernel) resetKernel(kernel);
  clearState(state);
  if (kernel) {
    state.worldEntity = undefined;
    state.worldEntity = spawnEntity(state, [IsExcluded]);
    for (const subscriber of state.resetSubscriptions) subscriber();
  }
}

export function destroyState(state: WorldState): void {
  const kernel = state.kernel;
  if (kernel !== null && (kernel.depth > 0 || kernel.flushing)) throw createInternalError('CONTEXT_DESTROY_DURING_MUTATION');
  if (kernel) destroyKernel(kernel);
  clearState(state);
  state.kernel = null;
  state.traitObserversAttached = false;
  state.worldEntity = undefined;
  releasePages(state);
  if (registry.worlds[state.id] === state) registry.worlds[state.id] = undefined;
  const world = state.worldRef.deref();
  if (world) worldFinalizer.unregister(world);
  if (kernel) for (const subscriber of state.resetSubscriptions) subscriber();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function readTrait(
  state: WorldState,
  entity: Entity,
  input: Trait | RelationPair,
  local = toLocal(state, entity)
): unknown {
  if (local === 0) return undefined;
  const type = resolveType(state, input);
  return type === 0 ? undefined : getTraitUnchecked(state.kernel!, local, type);
}

export function entityHas(
  state: WorldState,
  entity: Entity,
  input: Trait | RelationPair,
  local = toLocal(state, entity)
): boolean {
  if (local === 0) return false;
  const kernel = state.kernel!;
  if (isRelationPair(input) && input.targetQuery) {
    const relation = input.relation[$internal].id;
    if (!hasTraitUnchecked(kernel, local, pair(relation, Any))) return false;
    const parameters = isQuery(input.targetQuery) ? input.targetQuery.parameters : input.targetQuery;
    const query = resolveQuery(state, parameters, isQuery(input.targetQuery) ? input.targetQuery.hash : undefined);
    if (!query) return false;
    const targets = getTargets(kernel, local, relation);
    for (let i = 0; i < targets.length; i++) if (entityInQuery(kernel, query, targets[i])) return true;
    return false;
  }
  const type = resolveType(state, input);
  return type !== 0 && hasTraitUnchecked(kernel, local, type);
}
