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
  createInArchetypeNow,
  INDEX_MASK,
  isQuietSpawn,
  isReservedIndex,
  isSparseTrait,
  traverseAdd,
  allocateIndex,
  createWorld as createKernel,
  isWatched,
  noopFused,
  destroyEntity,
  destroyEntityNow,
  destroyWorld as destroyKernel,
  endMutation,
  entityAt,
  entityInQuery,
  getTraitUnchecked,
  getTargets,
  hasTraitUnchecked,
  markChanged,
  markChangedNow,
  pair,
  prepareDestroyer,
  prepareFusedAdd,
  prepareFusedAddMany,
  prepareFusedRemove,
  prepareSpawner,
  removeTrait,
  removeTraitNow,
  releaseReservation,
  reserveEntity,
  resetWorld as resetKernel,
  revision,
  setTraitUnchecked,
  setTraitUncheckedNow,
  type Archetype,
  type Fused,
  type FusedMany,
  type FusedSpawn,
  type EntityEntry,
  type World as Kernel,
  type TypeId,
} from '../../kernel';
import {
  clearCommands,
  type CommandBuffer,
  type CommandBufferState,
} from '../commands/command-buffer';
import type { Entity } from '../entity/types';
import { createInternalError } from '../errors';
import {
  allocateHandle,
  handleIndex,
  registry,
  releasePages,
  releaseReserved,
  toLocal,
} from '../handles';
import { IsExcluded, isQuery, resolveQuery } from '../query/query';
import { isRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { $internal } from '../symbols';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { worldFinalizer } from './finalization';
import { CommandKind, type Command, type WorldState } from './state';
import {
  attachCreatedObserver,
  attachObservers,
  attachTraitObservers,
  releaseEntity,
  watchSubscribedTraits,
} from './subscriptions';

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
  if (state.traitSubscriptions.size > 0) {
    attachTraitObservers(state, kernel);
    watchSubscribedTraits(state, kernel);
  }
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
    const trait = isRelationPair(config)
      ? config.relation[$internal].trait
      : Array.isArray(config)
        ? config[0]
        : config;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions && (subscriptions.add.size > 0 || subscriptions.byEntity.size > 0)) return true;
  }
  return false;
}

/** Kernel type for a trait or pair, or 0 when a pair targets a dead entity. */
function resolveType(state: WorldState, input: Trait | RelationPair): TypeId {
  const internal = (input as Trait)[$internal];
  if (internal !== undefined) return internal.id;
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
function addConfigs(
  state: WorldState,
  entity: Entity,
  traits: readonly ConfigurableTrait[],
  now: boolean,
  local = toLocal(state, entity),
  fast = now
): void {
  if (local === 0) return;
  // Fused path inside the caller's scope, so work a subscriber starts queues behind the whole call.
  if (fast && fastAddConfigs(state, local & INDEX_MASK, traits, true)) return;
  addEntries(state, traits, now, local);
}

/** The general path of `addConfigs`, kept apart so the fused attempt stays small enough to inline. */
function addEntries(
  state: WorldState,
  traits: readonly ConfigurableTrait[],
  now: boolean,
  local: number
): void {
  const kernel = state.kernel!;
  if (traits.length === 1 && now) {
    // Single plain trait: skips the entry array and observer scan, the add runs the same single-entry path.
    const only = traits[0];
    if (typeof only === 'function') {
      registerTrait(state, only as Trait);
      addTraitNow(kernel, local, (only as Trait)[$internal].id);
      return;
    }
  }
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

function removeConfigs(
  state: WorldState,
  entity: Entity,
  traits: readonly (Trait | RelationPair)[],
  now: boolean,
  local = toLocal(state, entity),
  fast = now
): void {
  if (local === 0) return;
  for (let i = 0; i < traits.length; i++) {
    const input = traits[i];
    // Fused path inside the caller's scope, so every remove of the call lands before queued work plays.
    if (
      fast &&
      typeof input === 'function' &&
      fastRemove(state, local & INDEX_MASK, input as Trait, true)
    )
      continue;
    removeConfig(state, input, now, local);
  }
}

function removeConfig(
  state: WorldState,
  input: Trait | RelationPair,
  now: boolean,
  local: number
): void {
  const type = resolveType(state, input);
  if (type === 0) return;
  if (now) removeTraitNow(state.kernel!, local, type);
  else removeTrait(state.kernel!, local, type);
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

function changedConfig(
  state: WorldState,
  entity: Entity,
  trait: Trait,
  target: Entity | undefined,
  now: boolean
): void {
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

/**
 * The archetype of a spawn made of plain traits or `[trait, value]` pairs, or
 * null when any argument is a relation pair or a sparse trait, or a trait
 * repeats. Sets `spawnMemo.valued` to whether any argument carries a pair and
 * keeps each slot's argument index in `spawnMemo.perm`. The last resolved
 * trait list is kept in place, so a repeated spawn compares identities and a
 * changing one allocates nothing. A trait that already has an edge was
 * registered when the edge was made, so the walk registers only on a miss.
 */
function plainSpawnArchetype(
  state: WorldState,
  kernel: Kernel,
  traits: readonly ConfigurableTrait[]
): Archetype | null {
  const memo = state.spawnMemo;
  const last = memo.traits;
  let archetype = memo.archetype;
  let valued = false;
  if (archetype !== null && memo.count === traits.length) {
    let i = 0;
    for (; i < traits.length; i++) {
      const config = traits[i];
      if (typeof config === 'function') {
        if (config !== last[i]) break;
      } else if ((config as unknown as unknown[])[0] === last[i]) {
        valued = true;
      } else {
        break;
      }
    }
    if (i === traits.length && kernel.archetypes[archetype.id] === archetype) {
      memo.valued = valued;
      return archetype;
    }
    valued = false;
  }
  memo.archetype = null;
  let walk = kernel.root;
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    let trait: Trait;
    if (typeof config === 'function') {
      trait = config as Trait;
    } else if (Array.isArray(config) && typeof config[0] === 'function') {
      trait = config[0] as Trait;
      valued = true;
    } else {
      return null;
    }
    last[i] = trait;
    const id = trait[$internal].id;
    const edge: Archetype | undefined = walk.byType[id] === undefined ? walk.edges[id] : undefined;
    if (edge !== undefined) {
      walk = edge;
      continue;
    }
    registerTrait(state, trait);
    if (isSparseTrait(id)) return null;
    walk = traverseAdd(kernel, walk, id);
  }
  if (walk.types.length !== traits.length) return null;
  const perm = memo.perm;
  for (let i = 0; i < traits.length; i++) perm[walk.byType[last[i][$internal].id]!.slot] = i;
  memo.archetype = walk;
  memo.count = traits.length;
  memo.valued = valued;
  return walk;
}

/**
 * The fused spawner for a plain spawn when the world is quiet and nobody
 * watches the traits or the spawn, with `spawnMemo.perm` ready for valued
 * arguments. `nested` allows an open mutation scope.
 */
function fusedSpawner(
  state: WorldState,
  kernel: Kernel,
  traits: readonly ConfigurableTrait[],
  nested: boolean
): Fused<FusedSpawn> | null {
  if (!kernel.quiet || (!nested && kernel.depth !== 0) || state.spawnSubscribers.size !== 0)
    return null;
  const archetype = plainSpawnArchetype(state, kernel, traits);
  if (archetype === null) return null;
  const valued = state.spawnMemo.valued;
  let spawner = valued ? archetype.valuedSpawner : archetype.spawner;
  if (spawner === undefined) spawner = prepareSpawner(archetype, valued);
  return spawner !== null && !isWatched(kernel, archetype) ? spawner : null;
}

export function spawnEntity(state: WorldState, traits: readonly ConfigurableTrait[]): Entity {
  ensureKernel(state);
  const kernel = state.kernel!;
  // Fused path: plain traits, with or without values, create through one generated function per archetype.
  const spawner = fusedSpawner(state, kernel, traits, false);
  if (spawner !== null) {
    const index = allocateIndex(kernel);
    let handle: Entity;
    try {
      handle = allocateHandle(state, index);
    } catch (error) {
      // The slot was never handed out, so it goes back to the free list as it was.
      kernel.free.push(index);
      throw error;
    }
    spawner.fn(kernel, spawner, index, revision, traits, state.spawnMemo.perm);
    return handle;
  }
  const local = reserveEntity(kernel);
  let entity: Entity;
  try {
    entity = allocateHandle(state, local);
  } catch (error) {
    // The reservation was never handed out, so it retires instead of holding its slot.
    releaseReservation(kernel, local);
    throw error;
  }
  if (traits.length > 0 && isQuietSpawn(kernel)) {
    // Fast path: plain valueless archetype traits resolve to one archetype and create in one pass.
    let archetype = kernel.root;
    let i = 0;
    for (; i < traits.length; i++) {
      const config = traits[i];
      if (Array.isArray(config) || isRelationPair(config)) break;
      const trait = config as Trait;
      registerTrait(state, trait);
      const id = trait[$internal].id;
      if (isSparseTrait(id)) break;
      archetype = traverseAdd(kernel, archetype, id);
    }
    if (i === traits.length) {
      beginMutation(kernel);
      try {
        createInArchetypeNow(kernel, local, archetype);
      } catch (error) {
        abortMutation(kernel);
        throw error;
      }
      endMutation(kernel);
      return entity;
    }
  }
  const entries = traits.length > 0 ? toEntries(state, traits) : undefined;
  // Inside a mutation the reservation outlives this call, so reset can release its handle.
  if (kernel.depth > 0) {
    attachCreatedObserver(state, kernel);
    state.reserved.add(handleIndex(entity));
  }
  createReserved(kernel, local, entries !== undefined && entries.length > 0 ? entries : undefined);
  return entity;
}

/** `fast` false skips the fused attempt, for a caller that already made it. */
export function addToEntity(
  state: WorldState,
  entity: Entity,
  traits: readonly ConfigurableTrait[],
  local?: number,
  fast = true
): void {
  ensureKernel(state);
  const kernel = state.kernel!;
  if (kernel.depth > 0) {
    addConfigs(state, entity, traits, false, local);
    return;
  }
  beginMutation(kernel);
  try {
    addConfigs(state, entity, traits, true, local, fast);
  } catch (error) {
    abortMutation(kernel);
    throw error;
  }
  endMutation(kernel);
}

/**
 * The fused add of one trait, one `[trait, value]` pair, or several traits, or
 * false when the general path must run. Every form is one transition, so it
 * needs no mutation scope of its own: `nested` is true inside the caller's
 * scope and false for a direct call at depth 0.
 */
export function fastAddConfigs(
  state: WorldState,
  index: number,
  traits: readonly ConfigurableTrait[],
  nested: boolean
): boolean {
  if (traits.length !== 1) return fastAddMany(state, index, traits, nested);
  const only = traits[0];
  if (typeof only === 'function') return fastAdd(state, index, only as Trait, undefined, nested);
  return (
    Array.isArray(only) &&
    typeof only[0] === 'function' &&
    fastAdd(state, index, only[0] as Trait, only[1], nested)
  );
}

/**
 * The archetype of the entity at `index` when a fused mutation may run on it:
 * the world is quiet, no mutation scope is open unless `nested`, and the slot
 * holds a created entity. Null otherwise.
 */
function fusedGate(kernel: Kernel, index: number, nested: boolean): Archetype | null {
  if (!kernel.quiet || (!nested && kernel.depth !== 0)) return null;
  return kernel.archetypes[kernel.archetypeOf[index]] ?? null;
}

/**
 * Adds one plain trait through the entity's fused transition. Returns false
 * when the general path must run: a closed `fusedGate`, a trait this world has
 * not registered yet, a subscription to the trait, an `onAdd` or `onSet` hook,
 * or a transition not yet used often enough to compile.
 */
function fastAdd(
  state: WorldState,
  index: number,
  trait: Trait,
  value: unknown,
  nested: boolean
): boolean {
  const kernel = state.kernel!;
  const from = fusedGate(kernel, index, nested);
  if (from === null) return false;
  const id = trait[$internal].id;
  if (kernel.watched[id] !== undefined) return false;
  let fused = from.fusedAdd[id];
  if (fused === undefined) {
    if (!state.traits.has(trait)) return false;
    fused = prepareFusedAdd(kernel, from, id);
    if (fused === null && from.fusedAdd[id] === undefined) {
      warmUp(kernel, index, id, value, true, nested);
      return true;
    }
  }
  if (fused === null) return false;
  fused.fn(kernel, fused, index, revision, value);
  return true;
}

/**
 * Runs the general path add or remove of a transition that is still warming
 * up, in a mutation scope of its own unless `nested`. Running it here keeps
 * callers on their fused shape, so their argument lists never escape into the
 * general entry points while the transition warms up.
 */
function warmUp(
  kernel: Kernel,
  index: number,
  type: TypeId,
  value: unknown,
  adding: boolean,
  nested: boolean
): void {
  const entity = entityAt(kernel, index);
  if (!nested) beginMutation(kernel);
  try {
    if (adding) addTraitNow(kernel, entity, type, value);
    else removeTraitNow(kernel, entity, type);
  } catch (error) {
    if (!nested) abortMutation(kernel);
    throw error;
  }
  if (!nested) endMutation(kernel);
}

/**
 * Adds several plain traits in one fused transition. Traits the entity
 * already holds are skipped, as the general path skips them. The last
 * resolved source archetype and trait list are kept in place, so repeating an
 * add compares identities. Returns false when the general path must run: a
 * trait that is not plain, registered in this world, unwatched and hook free,
 * a repeated trait, or the same conditions `fastAdd` has.
 */
function fastAddMany(
  state: WorldState,
  index: number,
  traits: readonly ConfigurableTrait[],
  nested: boolean
): boolean {
  const kernel = state.kernel!;
  const from = fusedGate(kernel, index, nested);
  if (from === null) return false;
  const memo = state.addMemo;
  const last = memo.traits;
  if (memo.from === from && memo.count === traits.length && memo.epoch === kernel.watchEpoch) {
    let i = 0;
    for (; i < traits.length; i++) {
      const config = traits[i];
      const trait = typeof config === 'function' ? config : (config as unknown as unknown[])[0];
      if (trait !== last[i]) break;
    }
    if (i === traits.length) {
      const fused = memo.fused;
      if (fused === null) return false;
      if (fused === noopFused || kernel.archetypes[fused.to.id] === fused.to) {
        fused.fn(kernel, fused, index, revision, traits, memo.perm);
        return true;
      }
    }
  }
  memo.from = null;
  let to = from;
  const added: number[] = [];
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    let trait: Trait;
    if (typeof config === 'function') trait = config as Trait;
    else if (Array.isArray(config) && typeof config[0] === 'function') trait = config[0] as Trait;
    else return false;
    last[i] = trait;
    const id = trait[$internal].id;
    if (kernel.watched[id] !== undefined || !state.traits.has(trait)) return false;
    if (from.byType[id] !== undefined) continue;
    if (added.includes(id) || isSparseTrait(id)) return false;
    added.push(id);
    to = traverseAdd(kernel, to, id);
  }
  let fused: Fused<FusedMany> | null = noopFused;
  const perm = memo.perm;
  if (to !== from) {
    const cached = from.fusedMany[to.id];
    fused = cached === undefined ? prepareFusedAddMany(from, to, added) : cached;
    for (let i = 0; i < traits.length; i++) {
      const trait = last[i];
      const record = to.byType[trait[$internal].id];
      if (record !== undefined && from.byType[trait[$internal].id] === undefined)
        perm[record.slot] = i;
    }
  }
  // A transition still warming up is not remembered, so later calls keep counting its uses.
  if (fused === null && from.fusedMany[to.id] !== null) return false;
  memo.from = from;
  memo.count = traits.length;
  memo.epoch = kernel.watchEpoch;
  memo.fused = fused;
  if (fused === null) return false;
  fused.fn(kernel, fused, index, revision, traits, perm);
  return true;
}

/** `fastAdd` for removal. One remove needs no mutation scope of its own, several share the caller's. */
export function fastRemove(state: WorldState, index: number, trait: Trait, nested: boolean): boolean {
  const kernel = state.kernel!;
  const from = fusedGate(kernel, index, nested);
  if (from === null) return false;
  const id = trait[$internal].id;
  if (kernel.watched[id] !== undefined) return false;
  let fused = from.fusedRemove[id];
  if (fused === undefined) {
    fused = prepareFusedRemove(kernel, from, id);
    if (fused === null && from.fusedRemove[id] === undefined) {
      warmUp(kernel, index, id, undefined, false, nested);
      return true;
    }
  }
  if (fused === null) return false;
  fused.fn(kernel, fused, index, revision);
  return true;
}

/** `fast` false skips the fused attempt, for a caller that already made it. */
export function removeFromEntity(
  state: WorldState,
  entity: Entity,
  traits: readonly (Trait | RelationPair)[],
  local?: number,
  fast = true
): void {
  const kernel = state.kernel;
  if (!kernel) return;
  if (kernel.depth > 0) {
    removeConfigs(state, entity, traits, false, local);
    return;
  }
  beginMutation(kernel);
  try {
    removeConfigs(state, entity, traits, true, local, fast);
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
  setConfig(
    state,
    entity,
    input,
    value,
    triggerChanged,
    false,
    local === 0 ? toLocal(state, entity) : local
  );
}

export function changedOnEntity(
  state: WorldState,
  entity: Entity,
  trait: Trait,
  target?: Entity
): void {
  ensureKernel(state);
  changedConfig(state, entity, trait, target, false);
}

/**
 * Destroys through the archetype's fused destroyer when the world is quiet and
 * the entity has no pairs or sparse traits. Returns false when the general
 * path must run.
 */
export function fastDestroy(
  state: WorldState,
  handle: Entity,
  index: number,
  nested = false
): boolean {
  const kernel = state.kernel!;
  const archetype = fusedGate(kernel, index, nested);
  if (archetype === null) return false;
  const observers = kernel.observers;
  if (
    state.destroySubscribers.size !== 0 ||
    observers.entityDestroyed.length !== 0 ||
    kernel.externals[index]?.length ||
    (kernel.pairsByTarget.size !== 0 && kernel.pairsByTarget.has(index))
  )
    return false;
  const destroyer =
    archetype.destroyer === undefined ? prepareDestroyer(archetype) : archetype.destroyer;
  if (destroyer === null || isWatched(kernel, archetype)) return false;
  destroyer.fn(kernel, destroyer, index);
  releaseEntity(state, handle);
  return true;
}

export function destroyPublicEntity(
  state: WorldState,
  entity: Entity,
  local = toLocal(state, entity)
): void {
  const kernel = state.kernel;
  if (!kernel) return;
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
      const spawner = fusedSpawner(state, kernel, traits, true);
      if (spawner !== null && isReservedIndex(kernel, local & INDEX_MASK)) {
        spawner.fn(kernel, spawner, local & INDEX_MASK, revision, traits, state.spawnMemo.perm);
        state.reserved.delete(handleIndex(command.entity));
        return;
      }
      const entries = traits.length > 0 ? toEntries(state, traits) : undefined;
      createReservedNow(
        kernel,
        local,
        entries !== undefined && entries.length > 0 ? entries : undefined
      );
      break;
    }
    case CommandKind.Destroy: {
      const local = toLocal(state, command.entity);
      if (local !== 0 && !fastDestroy(state, command.entity, local & INDEX_MASK, true)) {
        destroyEntityNow(kernel, local);
      }
      break;
    }
    case CommandKind.Add:
      addConfigs(state, command.entity, [command.operand as ConfigurableTrait], true);
      break;
    case CommandKind.Remove:
      removeConfigs(state, command.entity, [command.operand as Trait | RelationPair], true);
      break;
    case CommandKind.Set:
      setConfig(
        state,
        command.entity,
        command.operand as Trait | RelationPair,
        command.value,
        command.flag,
        true
      );
      break;
    case CommandKind.Changed:
      changedConfig(
        state,
        command.entity,
        command.operand as Trait,
        command.value as Entity | undefined,
        true
      );
      break;
  }
}

export function flushBuffers(state: WorldState, buffers: CommandBuffer[]): void {
  const current = state.kernel;
  if (current !== null && (current.depth > 0 || current.flushing))
    throw createInternalError('FLUSH_DURING_MUTATION');
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
  if (kernel !== null && (kernel.depth > 0 || kernel.flushing))
    throw createInternalError('CONTEXT_RESET_DURING_MUTATION');
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
  if (kernel !== null && (kernel.depth > 0 || kernel.flushing))
    throw createInternalError('CONTEXT_DESTROY_DURING_MUTATION');
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
    const query = resolveQuery(
      state,
      parameters,
      isQuery(input.targetQuery) ? input.targetQuery.hash : undefined
    );
    if (!query) return false;
    const targets = getTargets(kernel, local, relation);
    for (let i = 0; i < targets.length; i++)
      if (entityInQuery(kernel, query, targets[i])) return true;
    return false;
  }
  const type = resolveType(state, input);
  return type !== 0 && hasTraitUnchecked(kernel, local, type);
}
