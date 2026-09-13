import { createReservedNow, destroyEntityNow, entityAt, isAlive, releaseReservation, type EntityEntry } from './entity';
import { Any, isPair, pairTargetIndex, type Entity, type TypeId } from './id';
import { addTraitNow, addTraitsNow, markChangedNow, removeTraitNow, setTraitNow, setValueNow } from './trait';
import type { World } from './world';

/**
 * Deferred mutations.
 *
 * A mutation scope is open while a kernel operation runs, tracked by
 * `world.depth`. Mutations issued inside it, by hooks, observers, or a caller
 * that opened the scope explicitly, queue here and play in order when the
 * outermost scope closes. Commands queued during that playback play in the
 * same pass. The queue is parallel arrays reused across flushes, so queuing
 * and playing allocate nothing beyond the values the caller supplied.
 */

export const CREATE = 0;
export const DESTROY = 1;
export const ADD = 2;
export const ADD_ENTRIES = 3;
export const REMOVE = 4;
export const SET = 5;
export const SET_SILENT = 6;
export const SET_FIELD = 7;
export const SET_FIELD_SILENT = 8;
export const CHANGED = 9;

export type CommandQueue = {
  readonly kinds: number[];
  readonly entities: Entity[];
  readonly types: TypeId[];
  readonly values: unknown[];
  /** Target handle at queue time for concrete pair commands, so a recycled target is not matched at playback. */
  readonly targets: Entity[];
  /** Next command to play. */
  cursor: number;
};

export function createCommandQueue(): CommandQueue {
  return { kinds: [], entities: [], types: [], values: [], targets: [], cursor: 0 };
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export function beginMutation(world: World): void {
  world.depth++;
}

/** Closes a scope. Closing the outermost one plays whatever queued behind it. */
export function endMutation(world: World): void {
  if (--world.depth === 0 && !world.flushing && world.queue.cursor < world.queue.kinds.length) flush(world);
}

/** Closes a scope after a failure. Work queued behind the outermost scope is discarded. */
export function abortMutation(world: World): void {
  if (--world.depth === 0) discardCommands(world);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

function targetOf(world: World, type: TypeId): Entity {
  if (!isPair(type)) return 0;
  const targetIndex = pairTargetIndex(type);
  return targetIndex === Any ? 0 : entityAt(world, targetIndex);
}

function push(world: World, kind: number, entity: Entity, type: TypeId, value: unknown, target: Entity): void {
  const queue = world.queue;
  queue.kinds.push(kind);
  queue.entities.push(entity);
  queue.types.push(type);
  queue.values.push(value);
  queue.targets.push(target);
}

/** Queues a creation for a reserved entity. Pair entries queue as adds behind it, the order creation applies them in. */
export function enqueueCreate(world: World, entity: Entity, entries: readonly EntityEntry[] | undefined): void {
  if (entries === undefined) {
    push(world, CREATE, entity, 0, undefined, 0);
    return;
  }
  let own: EntityEntry[] | undefined;
  let pairs: EntityEntry[] | undefined;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const type = typeof entry === 'number' ? entry : entry[0];
    if (isPair(type)) (pairs ??= []).push(entry);
    else (own ??= []).push(entry);
  }
  push(world, CREATE, entity, 0, own, 0);
  if (pairs === undefined) return;
  for (let i = 0; i < pairs.length; i++) {
    const entry = pairs[i];
    if (typeof entry === 'number') enqueueAdd(world, entity, entry, undefined);
    else enqueueAdd(world, entity, entry[0], entry[1]);
  }
}

export function enqueueAdd(world: World, entity: Entity, type: TypeId, value: unknown): void {
  push(world, ADD, entity, type, value, targetOf(world, type));
}

/** Queues a batch add. Pair entries follow as single adds, the order `addTraits` applies them in. */
export function enqueueAddEntries(world: World, entity: Entity, entries: readonly EntityEntry[]): void {
  let own: EntityEntry[] | undefined;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const type = typeof entry === 'number' ? entry : entry[0];
    if (!isPair(type)) (own ??= []).push(entry);
  }
  if (own !== undefined) push(world, ADD_ENTRIES, entity, 0, own, 0);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const type = typeof entry === 'number' ? entry : entry[0];
    if (!isPair(type)) continue;
    if (typeof entry === 'number') enqueueAdd(world, entity, entry, undefined);
    else enqueueAdd(world, entity, entry[0], entry[1]);
  }
}

export function enqueueRemove(world: World, entity: Entity, type: TypeId): void {
  push(world, REMOVE, entity, type, undefined, targetOf(world, type));
}

export function enqueueSet(world: World, entity: Entity, type: TypeId, value: unknown, notify: boolean): void {
  push(world, notify ? SET : SET_SILENT, entity, type, value, targetOf(world, type));
}

export function enqueueSetValue(
  world: World,
  entity: Entity,
  type: TypeId,
  field: string,
  value: unknown,
  notify: boolean
): void {
  push(world, notify ? SET_FIELD : SET_FIELD_SILENT, entity, type, [field, value], targetOf(world, type));
}

export function enqueueChanged(world: World, entity: Entity, type: TypeId): void {
  push(world, CHANGED, entity, type, undefined, targetOf(world, type));
}

export function enqueueDestroy(world: World, entity: Entity): void {
  push(world, DESTROY, entity, 0, undefined, 0);
}

/** Drops every unplayed command. Reservations of unplayed creations retire, so their handles stay dead. */
export function discardCommands(world: World): void {
  const queue = world.queue;
  const kinds = queue.kinds;
  for (let i = queue.cursor; i < kinds.length; i++) {
    if (kinds[i] === CREATE) releaseReservation(world, queue.entities[i]);
  }
  resetQueue(queue);
}

function resetQueue(queue: CommandQueue): void {
  queue.kinds.length = 0;
  queue.entities.length = 0;
  queue.types.length = 0;
  queue.values.length = 0;
  queue.targets.length = 0;
  queue.cursor = 0;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

function play(world: World, kind: number, entity: Entity, type: TypeId, value: unknown, target: Entity): void {
  if (target !== 0 && !isAlive(world, target)) return;
  switch (kind) {
    case CREATE:
      createReservedNow(world, entity, value as EntityEntry[] | undefined);
      break;
    case DESTROY:
      destroyEntityNow(world, entity);
      break;
    case ADD:
      addTraitNow(world, entity, type, value);
      break;
    case ADD_ENTRIES:
      addTraitsNow(world, entity, value as EntityEntry[]);
      break;
    case REMOVE:
      removeTraitNow(world, entity, type);
      break;
    case SET:
      setTraitNow(world, entity, type, value, true);
      break;
    case SET_SILENT:
      setTraitNow(world, entity, type, value, false);
      break;
    case SET_FIELD: {
      const pair = value as [string, unknown];
      setValueNow(world, entity, type, pair[0], pair[1], true);
      break;
    }
    case SET_FIELD_SILENT: {
      const pair = value as [string, unknown];
      setValueNow(world, entity, type, pair[0], pair[1], false);
      break;
    }
    case CHANGED:
      markChangedNow(world, entity, type);
      break;
  }
}

/**
 * Plays queued commands in order, including commands queued while playing.
 * Each command runs in its own scope, so work it triggers queues behind it.
 * A throw discards the rest of the queue and propagates; completed commands
 * stay applied.
 */
export function flush(world: World): void {
  const queue = world.queue;
  world.flushing = true;
  try {
    while (queue.cursor < queue.kinds.length) {
      const i = queue.cursor++;
      const value = queue.values[i];
      queue.values[i] = undefined;
      world.depth++;
      try {
        play(world, queue.kinds[i], queue.entities[i], queue.types[i], value, queue.targets[i]);
      } catch (error) {
        world.depth--;
        discardCommands(world);
        throw error;
      }
      world.depth--;
    }
    resetQueue(queue);
  } finally {
    world.flushing = false;
  }
}
