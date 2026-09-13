import { appendEntity, removeRow, type Archetype } from './archetype';
import { abortMutation, beginMutation, endMutation, enqueueCreate, enqueueDestroy } from './commands';
import { addTraitNow, constructTrait, publishValue, removeTraitNow, traitValue } from './trait';
import {
  encodeEntity,
  ENTITY_MASK,
  entityIndex,
  GENERATION_MASK,
  INDEX_BITS,
  INDEX_MASK,
  isPair,
  MAX_GENERATION,
  MAX_INDEX,
  pairTargetIndex,
  type Entity,
  type TypeId,
} from './id';
import { fire } from './observer';
import { ADDED, notifyEvent, notifyTransition } from './query';
import { relationDefinition, sparseFlags } from './registry';
import { cleanupTarget } from './relation';
import { revision } from './revision';
import { archetypeAt, bumpVersion, ensureEntityCapacity, traverseAdd, type World } from './world';

export type EntityEntry = TypeId | readonly [TypeId, unknown];

/** `archetypeOf` value of a reserved slot: allocated, dead to `isAlive`, and not free. */
export const RESERVED = -2;

/** Types stored outside archetypes: concrete pairs and sparse traits. */
function isExternal(type: TypeId): boolean {
  return isPair(type) || sparseFlags[type] === 1;
}

export function isAlive(world: World, entity: Entity): boolean {
  if (entity !== (entity & ENTITY_MASK)) return false;
  const index = entity & INDEX_MASK;
  return (
    index !== 0 &&
    index < world.next &&
    world.archetypeOf[index] >= 0 &&
    world.generations[index] === ((entity >>> INDEX_BITS) & GENERATION_MASK)
  );
}

export function entityAt(world: World, index: number): Entity {
  return encodeEntity(world.generations[index], index);
}

export function getArchetype(world: World, entity: Entity): Archetype | undefined {
  return isAlive(world, entity) ? archetypeAt(world, entity & INDEX_MASK) : undefined;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function allocateIndex(world: World): number {
  if (world.free.length > 0) return world.free.pop()!;
  const index = world.next++;
  if (index > MAX_INDEX) throw new Error('Koota: Entity limit exceeded.');
  ensureEntityCapacity(world, index);
  return index;
}

/** Frees a slot for its next generation, or retires it once the generations run out. */
export function retireSlot(world: World, index: number): void {
  world.archetypeOf[index] = -1;
  const generation = world.generations[index];
  if (generation < MAX_GENERATION) {
    world.generations[index] = generation + 1;
    world.free.push(index);
  }
}

/**
 * Allocates an entity handle without creating the entity. It reads as dead
 * until `createReserved` places it, and a discarded creation retires it, so
 * the handle never identifies another entity.
 */
export function reserveEntity(world: World): Entity {
  const index = allocateIndex(world);
  world.archetypeOf[index] = RESERVED;
  return encodeEntity(world.generations[index], index);
}

function isReserved(world: World, entity: Entity): boolean {
  const index = entity & INDEX_MASK;
  return (
    entity === (entity & ENTITY_MASK) &&
    index !== 0 &&
    index < world.next &&
    world.archetypeOf[index] === RESERVED &&
    world.generations[index] === ((entity >>> INDEX_BITS) & GENERATION_MASK)
  );
}

/** Retires a reservation that will not be created. Returns false when the handle is not a live reservation. */
export function releaseReservation(world: World, entity: Entity): boolean {
  if (!isReserved(world, entity)) return false;
  retireSlot(world, entity & INDEX_MASK);
  return true;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Creates a reserved entity, placing it directly into the archetype of its
 * trait entries. Every trait constructs and takes its supplied value before
 * the adds publish, the changes publish after, then external entries apply.
 * `entityCreated` fires once every entry has been applied. A handle that is
 * no longer a live reservation is returned untouched.
 */
export function createReservedNow(world: World, entity: Entity, entries?: readonly EntityEntry[]): Entity {
  if (!isReserved(world, entity)) return entity;
  const index = entity & INDEX_MASK;
  let archetype = world.root;
  if (entries) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      if (!isExternal(type)) archetype = traverseAdd(world, archetype, type);
    }
  }
  world.archetypeOf[index] = archetype.id;
  const row = appendEntity(archetype, entity, revision);
  world.rowOf[index] = row;
  world.aliveCount++;
  if (entries) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      if (isExternal(type)) continue;
      constructTrait(world, entity, type, typeof entry === 'number' ? undefined : entry[1]);
      bumpVersion(world, type);
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      if (isExternal(type)) continue;
      fire(world, 'traitAdded', type, entity);
      if (!isAlive(world, entity)) return entity;
    }
  }
  notifyTransition(world, entity, null, archetypeAt(world, index));
  if (entries) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      if (!isExternal(type)) notifyEvent(world, type, entity, ADDED);
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (typeof entry === 'number' || isExternal(entry[0]) || entry[1] === undefined) continue;
      if (!isAlive(world, entity)) return entity;
      if (archetypeAt(world, index).records.has(entry[0])) publishValue(world, entity, entry[0]);
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const type = typeof entry === 'number' ? entry : entry[0];
      if (isExternal(type)) addTraitNow(world, entity, type, typeof entry === 'number' ? undefined : entry[1]);
    }
  }
  if (isAlive(world, entity)) fire(world, 'entityCreated', entity);
  return entity;
}

/** Creates an entity now. Callers inside a mutation scope use this so the creation is not queued. */
export function createEntityNow(world: World, entries?: readonly EntityEntry[]): Entity {
  return createReservedNow(world, reserveEntity(world), entries);
}

/**
 * Creates an entity. Inside a mutation scope the entity is reserved and its
 * creation queues, so the returned handle reads as dead until the scope
 * closes and the queue plays.
 */
export function createEntity(world: World, entries?: readonly EntityEntry[]): Entity {
  if (world.depth > 0) {
    const entity = reserveEntity(world);
    enqueueCreate(world, entity, entries);
    return entity;
  }
  return createReserved(world, reserveEntity(world), entries);
}

/** Creates a reserved entity, queued when a mutation scope is open. */
export function createReserved(world: World, entity: Entity, entries?: readonly EntityEntry[]): Entity {
  if (world.depth > 0) {
    enqueueCreate(world, entity, entries);
    return entity;
  }
  beginMutation(world);
  try {
    createReservedNow(world, entity, entries);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return entity;
}

// ---------------------------------------------------------------------------
// Destruction
// ---------------------------------------------------------------------------

/**
 * Destroys an entity and everything its relations require: pairs targeting it
 * leave their sources, sources of `autoDestroy: 'source'` relations die with
 * it, and targets of `autoDestroy: 'target'` relations die with their source.
 */
export function destroyEntityNow(world: World, entity: Entity): boolean {
  if (!isAlive(world, entity) || world.destroying.has(entity & INDEX_MASK)) return false;
  const queue: Entity[] = [entity];
  const marks = world.destroying;
  marks.add(entity & INDEX_MASK);
  try {
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      if (!isAlive(world, current)) continue;
      const index = current & INDEX_MASK;
      fire(world, 'entityDestroying', current);
      if (!isAlive(world, current)) continue;

      // Targets that die with this source, then the source's own pairs and sparse traits.
      const list = world.externals[index];
      if (list !== undefined && list.length > 0) {
        const types: TypeId[] = [];
        for (let i = 0; i < list.length; i += 2) types.push(list[i]);
        for (let i = 0; i < types.length; i++) {
          if (!isPair(types[i]) || relationDefinition(types[i]).autoDestroy !== 2) continue;
          const targetIndex = pairTargetIndex(types[i]);
          if (world.archetypeOf[targetIndex] < 0 || marks.has(targetIndex)) continue;
          marks.add(targetIndex);
          queue.push(entityAt(world, targetIndex));
        }
        for (let i = 0; i < types.length; i++) removeTraitNow(world, current, types[i]);
        if (!isAlive(world, current)) continue;
      }

      // Pairs targeting this entity leave their sources, which may die too.
      cleanupTarget(world, index, queue, marks);
      if (!isAlive(world, current)) continue;

      // Observers first, then each trait's remove hook while its value is readable.
      let archetype = archetypeAt(world, index);
      const own = archetype.slotRecords;
      for (let i = 0; i < own.length; i++) {
        const type = own[i].type;
        fire(world, 'traitRemoving', type, current);
        if (!isAlive(world, current)) break;
        const hook = own[i].onRemove;
        if (hook !== null) {
          const live = archetypeAt(world, index);
          if (live.records.has(type)) hook(world, current, type, traitValue(live, type, world.rowOf[index]));
          if (!isAlive(world, current)) break;
        }
      }
      if (!isAlive(world, current)) continue;

      archetype = archetypeAt(world, index);
      const row = world.rowOf[index];
      const swapped = removeRow(archetype, row);
      if (swapped !== 0) world.rowOf[swapped & INDEX_MASK] = row;
      world.aliveCount--;
      retireSlot(world, index);
      // Query subscribers see the entity gone, matching trait removal.
      notifyTransition(world, current, archetype, null);
      fire(world, 'entityDestroyed', current);
    }
  } finally {
    for (let i = 0; i < queue.length; i++) marks.delete(entityIndex(queue[i]));
  }
  return true;
}

/** Destroys an entity, queued when a mutation scope is open. Queued calls report true. */
export function destroyEntity(world: World, entity: Entity): boolean {
  if (world.depth > 0) {
    enqueueDestroy(world, entity);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = destroyEntityNow(world, entity);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

export function entityCount(world: World): number {
  return world.aliveCount;
}

export function getEntities(world: World): Entity[] {
  const result: Entity[] = [];
  const archetypes = world.archetypes;
  for (let i = 0; i < archetypes.length; i++) {
    const archetype = archetypes[i];
    if (!archetype) continue;
    const entities = archetype.entities;
    for (let j = 0; j < entities.length; j++) result.push(entities[j]);
  }
  return result;
}
