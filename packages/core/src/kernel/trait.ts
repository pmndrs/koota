import { copyRow, removeRow, stampChanged, type Archetype } from './archetype';
import { abortMutation, beginMutation, endMutation, enqueueAdd, enqueueAddEntries, enqueueChanged, enqueueRemove, enqueueSet, enqueueSetValue } from './commands';
import { isAlive, type EntityEntry } from './entity';
import {
  Any,
  encodePair,
  INDEX_MASK,
  isPair,
  PAIR_FLAG,
  pairRelationIndex,
  pairTargetIndex,
  type Entity,
  type TypeId,
} from './id';
import { fire } from './observer';
import { countRelationPairs, findRelationPair, hasAnyPair, hasTargetPair, relationPairs } from './pairs';
import { ADDED, CHANGED, hasTrackers, notifyEvent, notifyExternal, notifyTransition, REMOVED } from './query';
import { definitions, relationDefinition, sparseFlags, typeHooks, type TraitHooks } from './registry';
import { revision } from './revision';
import {
  constructRecord,
  constructRow,
  initializeRow,
  mergeRecord,
  readRecord,
  writeRecord,
  type Column,
  type ColumnPlan,
} from './schema';
import { eraseRow, insertRow, storeRow, type Store } from './store';
import { archetypeAt, bumpVersion, traverseAdd, traverseRemove, type World } from './world';

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export function hasTrait(world: World, entity: Entity, type: TypeId): boolean {
  if (!isAlive(world, entity)) return false;
  const index = entity & INDEX_MASK;
  const archetype = archetypeAt(world, index);
  if (type >= PAIR_FLAG) return hasPair(world, index, archetype, type);
  return archetype.records.has(type) || (sparseFlags[type] === 1 && storeRow(world, index, type) >= 0);
}

/**
 * `hasTrait` for a handle the caller has already validated. Only the slot's
 * occupancy is checked, so a stale generation must not reach here.
 */
export function hasTraitUnchecked(world: World, entity: Entity, type: TypeId): boolean {
  const index = entity & INDEX_MASK;
  const archetype = world.archetypes[world.archetypeOf[index]];
  if (!archetype) return false;
  if (type >= PAIR_FLAG) return hasPair(world, index, archetype, type);
  return archetype.records.has(type) || (sparseFlags[type] === 1 && storeRow(world, index, type) >= 0);
}

function hasPair(world: World, index: number, archetype: Archetype, pair: TypeId): boolean {
  const relationIndex = pairRelationIndex(pair);
  const targetIndex = pairTargetIndex(pair);
  if (targetIndex === Any) {
    if (relationIndex === 0) return hasAnyPair(world, index);
    return archetype.records.has(pair);
  }
  if (relationIndex === 0) return hasTargetPair(world, index, targetIndex);
  return storeRow(world, index, pair) >= 0;
}

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

function moveEntity(world: World, entity: Entity, from: Archetype, to: Archetype): void {
  const index = entity & INDEX_MASK;
  const row = world.rowOf[index];
  const toRow = copyRow(from, row, to, revision);
  const swapped = removeRow(from, row);
  if (swapped !== 0) world.rowOf[swapped & INDEX_MASK] = row;
  world.archetypeOf[index] = to.id;
  world.rowOf[index] = toRow;
}

function recordRemoved(world: World, type: TypeId, entity: Entity): void {
  if (!hasTrackers()) return;
  let map = world.removed.get(type);
  if (!map) world.removed.set(type, (map = new Map()));
  map.set(entity, revision);
}

function entryType(entry: EntityEntry): TypeId {
  return typeof entry === 'number' ? entry : entry[0];
}

function entryValue(entry: EntityEntry): unknown {
  return typeof entry === 'number' ? undefined : entry[1];
}

/** Hooks of a trait, or of a concrete pair's relation. */
function hooksOf(type: TypeId): TraitHooks | null {
  return isPair(type) ? relationDefinition(type).hooks : definitions[type]!.hooks;
}

/** Types stored outside archetypes: concrete pairs and sparse traits. */
function isExternal(type: TypeId): boolean {
  return type >= PAIR_FLAG || sparseFlags[type] === 1;
}

function externalStore(world: World, type: TypeId): Store | undefined {
  return world.stores.get(type);
}

function externalRow(world: World, index: number, type: TypeId): number {
  return storeRow(world, index, type);
}

/** Snapshot of a trait held in an archetype row, or undefined for a tag. */
export function traitValue(archetype: Archetype, type: TypeId, row: number): unknown {
  const record = archetype.records.get(type);
  return record === undefined || record.columns === null ? undefined : readRecord(record.columns, record.plan!, row);
}

function pairValue(store: Store, row: number): unknown {
  return store.plan === null ? undefined : readRecord(store.columns!, store.plan, row);
}

/**
 * Writes a full record to wherever the trait lives now. Kernel hooks may move
 * the entity, so storage is resolved again after a hook returns. Returns false
 * when the entity no longer holds the trait.
 */
function commitRecord(world: World, entity: Entity, type: TypeId, record: unknown): boolean {
  if (!isAlive(world, entity)) return false;
  const index = entity & INDEX_MASK;
  if (isExternal(type)) {
    const store = externalStore(world, type);
    if (store === undefined || store.plan === null) return false;
    const row = externalRow(world, index, type);
    if (row < 0) return false;
    writeRecord(store.columns!, store.plan, row, record, false);
    return true;
  }
  const found = archetypeAt(world, index).records.get(type);
  if (found === undefined || found.columns === null) return false;
  writeRecord(found.columns, found.plan!, world.rowOf[index], record, false);
  return true;
}

/**
 * Constructs storage for a trait the entity already holds and applies a
 * supplied value: create, then set. Without hooks both happen in one column
 * pass. With hooks the add hook edits the constructed record before it
 * commits, then the value goes through the set hook. The record is written
 * even when the add hook throws, so the trait never sits attached with blank
 * columns. Returns whether a value was applied, so the caller can publish the
 * change once the add has been published.
 */
function constructStorage(
  world: World,
  entity: Entity,
  type: TypeId,
  columns: Column[] | null | undefined,
  plan: ColumnPlan | null | undefined,
  row: number,
  value: unknown
): boolean {
  const hooks = hooksOf(type);
  if (columns === undefined || columns === null || plan === undefined || plan === null) {
    if (hooks !== null && hooks.onAdd !== null) hooks.onAdd(world, entity, type, undefined);
    return false;
  }
  if (hooks === null || (hooks.onAdd === null && hooks.onSet === null)) {
    initializeRow(columns, plan, row, world, entity, value);
    return value !== undefined;
  }
  const onAdd = hooks.onAdd;
  const instance = plan.aos ? value : undefined;
  if (onAdd === null) {
    constructRow(columns, plan, row, world, entity, instance);
  } else {
    const record = constructRecord(plan, world, entity, instance);
    try {
      onAdd(world, entity, type, record);
    } finally {
      commitRecord(world, entity, type, record);
    }
  }
  return value !== undefined && setTraitNow(world, entity, type, value, false);
}

/** Constructs a trait in the entity's current archetype row and applies its value. */
export function constructTrait(world: World, entity: Entity, type: TypeId, value: unknown): boolean {
  const index = entity & INDEX_MASK;
  const record = archetypeAt(world, index).records.get(type);
  return constructStorage(
    world,
    entity,
    type,
    record === undefined ? undefined : record.columns,
    record === undefined ? undefined : record.plan,
    world.rowOf[index],
    value
  );
}

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

/**
 * Adds a trait or pair. Construction and the add hook run first, then a
 * supplied value is applied as a set through the set hook, and only then do
 * observers hear about the add, so they never see a value a hook would still
 * change. The change itself publishes after the add. Returns false for a dead
 * entity or target, or when already present.
 */
export function addTraitNow(world: World, entity: Entity, type: TypeId, value?: unknown): boolean {
  if (!isAlive(world, entity)) return false;
  if (isPair(type)) return addPair(world, entity, type, value);
  const index = entity & INDEX_MASK;
  const from = archetypeAt(world, index);
  if (from.records.has(type)) return false;
  if (sparseFlags[type] === 1) return addSparse(world, entity, type, value);
  const to = traverseAdd(world, from, type);
  moveEntity(world, entity, from, to);
  const applied = constructTrait(world, entity, type, value);
  world.removed.get(type)?.delete(entity);
  bumpVersion(world, type);
  fire(world, 'traitAdded', type, entity);
  if (!isAlive(world, entity)) return true;
  notifyTransition(world, entity, from, archetypeAt(world, index));
  notifyEvent(world, type, entity, ADDED);
  if (applied) publishChange(world, entity, type, null, -1);
  return true;
}

/**
 * Adds several entries in one archetype transition. Traits already present
 * keep their data and ignore their entry's value. Values of new traits apply
 * as sets before the adds publish, their changes publish after, then pairs
 * apply one by one.
 */
export function addTraitsNow(world: World, entity: Entity, entries: readonly EntityEntry[]): void {
  if (!isAlive(world, entity)) return;
  const index = entity & INDEX_MASK;
  const from = archetypeAt(world, index);
  let to = from;
  for (let i = 0; i < entries.length; i++) {
    const type = entryType(entries[i]);
    if (!isExternal(type)) to = traverseAdd(world, to, type);
  }
  if (to !== from) {
    moveEntity(world, entity, from, to);
    for (let i = 0; i < entries.length; i++) {
      const type = entryType(entries[i]);
      if (isExternal(type) || from.records.has(type)) continue;
      constructTrait(world, entity, type, entryValue(entries[i]));
      world.removed.get(type)?.delete(entity);
      bumpVersion(world, type);
    }
    for (let i = 0; i < entries.length; i++) {
      const type = entryType(entries[i]);
      if (isExternal(type) || from.records.has(type)) continue;
      fire(world, 'traitAdded', type, entity);
      if (!isAlive(world, entity)) return;
    }
    notifyTransition(world, entity, from, archetypeAt(world, index));
    for (let i = 0; i < entries.length; i++) {
      const type = entryType(entries[i]);
      if (isExternal(type) || from.records.has(type)) continue;
      notifyEvent(world, type, entity, ADDED);
    }
    for (let i = 0; i < entries.length; i++) {
      const type = entryType(entries[i]);
      if (isExternal(type) || from.records.has(type) || entryValue(entries[i]) === undefined) continue;
      if (!isAlive(world, entity)) return;
      if (archetypeAt(world, index).records.has(type)) publishValue(world, entity, type);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    const type = entryType(entries[i]);
    if (isPair(type)) addPair(world, entity, type, entryValue(entries[i]));
    else if (sparseFlags[type] === 1) addSparse(world, entity, type, entryValue(entries[i]));
  }
}

function addPair(world: World, entity: Entity, pair: TypeId, value: unknown): boolean {
  const relationIndex = pairRelationIndex(pair);
  const targetIndex = pairTargetIndex(pair);
  if (relationIndex === 0 || targetIndex === Any) throw new Error('Koota: Wildcard pairs cannot be added.');
  if (world.archetypeOf[targetIndex] < 0) return false;
  const index = entity & INDEX_MASK;
  if (storeRow(world, index, pair) >= 0) return false;
  const definition = relationDefinition(pair);
  let replaced = 0;

  if (definition.exclusive) {
    const previous = findRelationPair(world, index, relationIndex);
    if (previous !== 0) {
      fire(world, 'traitRemoving', previous, entity);
      if (!isAlive(world, entity) || storeRow(world, index, pair) >= 0) return false;
      const onRemove = definition.hooks !== null ? definition.hooks.onRemove : null;
      if (onRemove !== null) {
        const previousRow = storeRow(world, index, previous);
        if (previousRow >= 0) {
          onRemove(world, entity, previous, pairValue(world.stores.get(previous)!, previousRow));
          if (!isAlive(world, entity) || storeRow(world, index, pair) >= 0) return false;
        }
      }
      if (eraseRow(world, entity, previous)) {
        replaced = previous;
        recordRemoved(world, previous, entity);
        bumpVersion(world, previous);
      }
    }
  }

  const aggregate = encodePair(relationIndex, Any);
  const from = archetypeAt(world, index);
  const addedAggregate = !from.records.has(aggregate);
  if (addedAggregate) moveEntity(world, entity, from, traverseAdd(world, from, aggregate));

  const row = insertRow(world, entity, pair, revision);
  const store = world.stores.get(pair)!;
  const applied = constructStorage(world, entity, pair, store.columns, store.plan, row, value);
  world.removed.get(pair)?.delete(entity);
  if (addedAggregate) world.removed.get(aggregate)?.delete(entity);
  bumpVersion(world, pair);
  bumpVersion(world, aggregate);

  if (replaced !== 0) notifyEvent(world, replaced, entity, REMOVED);
  fire(world, 'traitAdded', pair, entity);
  if (addedAggregate && isAlive(world, entity)) fire(world, 'traitAdded', aggregate, entity);
  if (!isAlive(world, entity)) return true;
  if (addedAggregate) notifyTransition(world, entity, from, archetypeAt(world, index));
  notifyExternal(world, entity);
  notifyEvent(world, pair, entity, ADDED);
  if (addedAggregate) notifyEvent(world, aggregate, entity, ADDED);
  if (applied && storeRow(world, index, pair) >= 0) publishChange(world, entity, pair, null, -1);
  return true;
}

/** Adds a sparse trait: a store insert with no archetype move, then the same publication as any add. */
function addSparse(world: World, entity: Entity, type: TypeId, value: unknown): boolean {
  const index = entity & INDEX_MASK;
  if (storeRow(world, index, type) >= 0) return false;
  const row = insertRow(world, entity, type, revision);
  const store = world.stores.get(type)!;
  const applied = constructStorage(world, entity, type, store.columns, store.plan, row, value);
  world.removed.get(type)?.delete(entity);
  bumpVersion(world, type);
  fire(world, 'traitAdded', type, entity);
  if (!isAlive(world, entity)) return true;
  notifyExternal(world, entity);
  notifyEvent(world, type, entity, ADDED);
  if (applied && storeRow(world, index, type) >= 0) publishChange(world, entity, type, null, -1);
  return true;
}

// ---------------------------------------------------------------------------
// Removing
// ---------------------------------------------------------------------------

/**
 * Removes a trait or pair. Observers run first, then the remove hook with the
 * value still readable, then the move. `pair(relation, Any)` removes every
 * pair of that relation.
 */
export function removeTraitNow(world: World, entity: Entity, type: TypeId): boolean {
  if (!isAlive(world, entity)) return false;
  if (isPair(type)) return removePair(world, entity, type);
  const index = entity & INDEX_MASK;
  const from = archetypeAt(world, index);
  if (!from.records.has(type)) return sparseFlags[type] === 1 ? removeSparse(world, entity, type) : false;
  fire(world, 'traitRemoving', type, entity);
  if (!isAlive(world, entity)) return true;
  let current = archetypeAt(world, index);
  if (!current.records.has(type)) return true;
  const hooks = definitions[type]!.hooks;
  if (hooks !== null && hooks.onRemove !== null) {
    hooks.onRemove(world, entity, type, traitValue(current, type, world.rowOf[index]));
    if (!isAlive(world, entity)) return true;
    current = archetypeAt(world, index);
    if (!current.records.has(type)) return true;
  }
  recordRemoved(world, type, entity);
  const to = traverseRemove(world, current, type);
  moveEntity(world, entity, current, to);
  bumpVersion(world, type);
  notifyTransition(world, entity, current, to);
  notifyEvent(world, type, entity, REMOVED);
  return true;
}

function removePair(world: World, entity: Entity, pair: TypeId): boolean {
  const relationIndex = pairRelationIndex(pair);
  const targetIndex = pairTargetIndex(pair);
  const index = entity & INDEX_MASK;
  if (relationIndex === 0) throw new Error('Koota: Wildcard relation pairs cannot be removed.');
  if (targetIndex === Any) {
    const pairs = relationPairs(world, index, relationIndex);
    for (let i = 0; i < pairs.length; i++) removePair(world, entity, pairs[i]);
    return pairs.length > 0;
  }
  if (storeRow(world, index, pair) < 0) return false;
  fire(world, 'traitRemoving', pair, entity);
  if (!isAlive(world, entity) || storeRow(world, index, pair) < 0) return true;
  const hooks = relationDefinition(pair).hooks;
  if (hooks !== null && hooks.onRemove !== null) {
    hooks.onRemove(world, entity, pair, pairValue(world.stores.get(pair)!, storeRow(world, index, pair)));
    if (!isAlive(world, entity) || storeRow(world, index, pair) < 0) return true;
  }
  const aggregate = encodePair(relationIndex, Any);
  const dropAggregate = countRelationPairs(world, index, relationIndex) === 1;
  if (dropAggregate) {
    fire(world, 'traitRemoving', aggregate, entity);
    if (!isAlive(world, entity) || storeRow(world, index, pair) < 0) return true;
  }
  eraseRow(world, entity, pair);
  recordRemoved(world, pair, entity);
  bumpVersion(world, pair);
  bumpVersion(world, aggregate);
  let from: Archetype | null = null;
  if (dropAggregate && countRelationPairs(world, index, relationIndex) === 0) {
    from = archetypeAt(world, index);
    if (from.records.has(aggregate)) {
      recordRemoved(world, aggregate, entity);
      moveEntity(world, entity, from, traverseRemove(world, from, aggregate));
    } else {
      from = null;
    }
  }
  if (from !== null) notifyTransition(world, entity, from, archetypeAt(world, index));
  notifyExternal(world, entity);
  notifyEvent(world, pair, entity, REMOVED);
  if (from !== null) notifyEvent(world, aggregate, entity, REMOVED);
  return true;
}

/** Removes a sparse trait: observers, the remove hook with the value readable, then the store erase. */
function removeSparse(world: World, entity: Entity, type: TypeId): boolean {
  const index = entity & INDEX_MASK;
  if (storeRow(world, index, type) < 0) return false;
  fire(world, 'traitRemoving', type, entity);
  if (!isAlive(world, entity) || storeRow(world, index, type) < 0) return true;
  const hooks = definitions[type]!.hooks;
  if (hooks !== null && hooks.onRemove !== null) {
    hooks.onRemove(world, entity, type, pairValue(world.stores.get(type)!, storeRow(world, index, type)));
    if (!isAlive(world, entity) || storeRow(world, index, type) < 0) return true;
  }
  eraseRow(world, entity, type);
  recordRemoved(world, type, entity);
  bumpVersion(world, type);
  notifyExternal(world, entity);
  notifyEvent(world, type, entity, REMOVED);
  return true;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export function getColumns(archetype: Archetype, type: TypeId): Column[] | undefined {
  return archetype.records.get(type)?.columns ?? undefined;
}

/** Snapshot of a data trait, the AoS instance, or undefined when absent or a tag. */
export function getTrait(world: World, entity: Entity, type: TypeId): unknown {
  return isAlive(world, entity) ? getTraitUnchecked(world, entity, type) : undefined;
}

/** `getTrait` for a handle the caller has already validated. Only the slot's occupancy is checked. */
export function getTraitUnchecked(world: World, entity: Entity, type: TypeId): unknown {
  const index = entity & INDEX_MASK;
  const archetype = world.archetypes[world.archetypeOf[index]];
  if (!archetype) return undefined;
  const record = type < PAIR_FLAG ? archetype.records.get(type) : undefined;
  if (record !== undefined) {
    return record.columns === null ? undefined : readRecord(record.columns, record.plan!, world.rowOf[index]);
  }
  if (!isExternal(type)) return undefined;
  const store = externalStore(world, type);
  if (!store || !store.plan) return undefined;
  const row = externalRow(world, index, type);
  return row < 0 ? undefined : readRecord(store.columns!, store.plan, row);
}

/** Data writes to a pair also advance its relation aggregate. */
function bumpTypeVersion(world: World, type: TypeId): void {
  bumpVersion(world, type);
  if (isPair(type)) bumpVersion(world, encodePair(pairRelationIndex(type), Any));
}

/**
 * Change publication for a value supplied with an add. Without change
 * observers or tracking queries it is a stamp and a version bump; otherwise
 * it is the full publication, which re-resolves storage.
 */
export function publishValue(world: World, entity: Entity, type: TypeId): void {
  if (!isExternal(type) && world.observers.traitChanged.length === 0 && world.trackingByType.size === 0) {
    const index = entity & INDEX_MASK;
    stampChanged(archetypeAt(world, index), type, world.rowOf[index], revision);
    bumpVersion(world, type);
    return;
  }
  publishChange(world, entity, type, null, -1);
}

/**
 * Stamps, versions, observers, and query events for a change. Callers that
 * still hold the entity's archetype and row pass them; after a hook ran, they
 * pass null and storage is resolved again, since kernel hooks may move the
 * entity.
 */
export function publishChange(
  world: World,
  entity: Entity,
  type: TypeId,
  archetype: Archetype | null,
  row: number
): void {
  const index = entity & INDEX_MASK;
  if (archetype === null) {
    archetype = archetypeAt(world, index);
    row = isExternal(type) ? externalRow(world, index, type) : world.rowOf[index];
  }
  if (isExternal(type)) {
    const store = externalStore(world, type);
    if (store !== undefined && row >= 0) {
      store.changed[row] = revision;
      if (revision > store.maxChanged) store.maxChanged = revision;
    }
    if (isPair(type)) stampChanged(archetype, encodePair(pairRelationIndex(type), Any), world.rowOf[index], revision);
  } else {
    stampChanged(archetype, type, row, revision);
  }
  bumpTypeVersion(world, type);
  fire(world, 'traitChanged', type, entity);
  if (!isAlive(world, entity)) return;
  notifyEvent(world, type, entity, CHANGED);
  if (isPair(type)) notifyEvent(world, encodePair(pairRelationIndex(type), Any), entity, CHANGED);
}

/**
 * Writes a data trait. SoA values merge field by field, AoS values replace
 * the instance, and a function receives the current value. With a set hook,
 * the merged record goes to the hook first and is written once afterwards, so
 * a throw leaves the previous value in place. Returns false when the entity
 * lacks the type or the type stores nothing.
 */
export function setTraitNow(world: World, entity: Entity, type: TypeId, value: unknown, notify = true): boolean {
  return isAlive(world, entity) && setTraitUncheckedNow(world, entity, type, value, notify);
}

/** `setTrait` for a handle the caller has already validated. Only the slot's occupancy is checked. */
export function setTraitUncheckedNow(world: World, entity: Entity, type: TypeId, value: unknown, notify = true): boolean {
  const index = entity & INDEX_MASK;
  const archetype = world.archetypes[world.archetypeOf[index]];
  if (!archetype) return false;
  let columns: Column[];
  let plan: ColumnPlan;
  let row: number;
  let hooks: TraitHooks | null;
  const record = type < PAIR_FLAG ? archetype.records.get(type) : undefined;
  if (record !== undefined) {
    if (record.columns === null) return false;
    columns = record.columns;
    plan = record.plan!;
    row = world.rowOf[index];
    hooks = definitions[type]!.hooks;
  } else {
    if (!isExternal(type)) return false;
    const store = externalStore(world, type);
    if (!store || !store.plan) return false;
    row = externalRow(world, index, type);
    if (row < 0) return false;
    columns = store.columns!;
    plan = store.plan;
    hooks = hooksOf(type);
  }
  if (typeof value === 'function') value = value(readRecord(columns, plan, row));
  const onSet = hooks !== null ? hooks.onSet : null;
  if (onSet !== null) {
    const record = mergeRecord(columns, plan, row, value);
    onSet(world, entity, type, record);
    if (!commitRecord(world, entity, type, record)) return true;
    if (notify) publishChange(world, entity, type, null, -1);
    else bumpTypeVersion(world, type);
    return true;
  }
  writeRecord(columns, plan, row, value, !plan.aos);
  if (notify) publishChange(world, entity, type, archetype, row);
  else bumpTypeVersion(world, type);
  return true;
}

export function getValue(world: World, entity: Entity, type: TypeId, field: string): unknown {
  if (!isAlive(world, entity)) return undefined;
  const index = entity & INDEX_MASK;
  const record = type < PAIR_FLAG ? archetypeAt(world, index).records.get(type) : undefined;
  if (record !== undefined) {
    if (record.columns === null) return undefined;
    const position = record.plan!.fields.indexOf(field);
    return position < 0 ? undefined : record.columns[position][world.rowOf[index]];
  }
  if (!isExternal(type)) return undefined;
  const store = externalStore(world, type);
  if (!store || !store.plan) return undefined;
  const row = externalRow(world, index, type);
  const position = store.plan.fields.indexOf(field);
  return row < 0 || position < 0 ? undefined : store.columns![position][row];
}

/** Writes one field. With a set hook the whole record passes through the hook. */
export function setValueNow(
  world: World,
  entity: Entity,
  type: TypeId,
  field: string,
  value: unknown,
  notify = true
): boolean {
  if (!isAlive(world, entity)) return false;
  const index = entity & INDEX_MASK;
  const archetype = archetypeAt(world, index);
  let columns: Column[];
  let plan: ColumnPlan;
  let row: number;
  let hooks: TraitHooks | null;
  const record = type < PAIR_FLAG ? archetype.records.get(type) : undefined;
  if (record !== undefined) {
    if (record.columns === null) return false;
    columns = record.columns;
    plan = record.plan!;
    row = world.rowOf[index];
    hooks = definitions[type]!.hooks;
  } else {
    if (!isExternal(type)) return false;
    const store = externalStore(world, type);
    if (!store || !store.plan) return false;
    row = externalRow(world, index, type);
    if (row < 0) return false;
    columns = store.columns!;
    plan = store.plan;
    hooks = hooksOf(type);
  }
  const position = plan.fields.indexOf(field);
  if (position < 0) return false;
  const onSet = hooks !== null ? hooks.onSet : null;
  if (onSet !== null) {
    const record = readRecord(columns, plan, row) as Record<string, unknown>;
    record[field] = value;
    onSet(world, entity, type, record);
    if (!commitRecord(world, entity, type, record)) return true;
    if (notify) publishChange(world, entity, type, null, -1);
    else bumpTypeVersion(world, type);
    return true;
  }
  columns[position][row] = value;
  if (notify) publishChange(world, entity, type, archetype, row);
  else bumpTypeVersion(world, type);
  return true;
}

/**
 * Publishes a change without writing, for data mutated through borrowed
 * columns. A set hook sees the current record and its edits are written back.
 */
export function markChangedNow(world: World, entity: Entity, type: TypeId): boolean {
  if (!isAlive(world, entity)) return false;
  const index = entity & INDEX_MASK;
  const archetype = archetypeAt(world, index);
  let row: number;
  const external = !archetype.records.has(type);
  if (external) {
    if (!isExternal(type)) return false;
    row = externalRow(world, index, type);
    if (row < 0) return false;
  } else {
    row = world.rowOf[index];
  }
  const hooks = typeHooks(type);
  const onSet = hooks !== null ? hooks.onSet : null;
  if (onSet !== null) {
    const value = external ? pairValue(externalStore(world, type)!, row) : traitValue(archetype, type, row);
    if (value !== undefined) {
      onSet(world, entity, type, value);
      if (!commitRecord(world, entity, type, value)) return true;
      publishChange(world, entity, type, null, -1);
      return true;
    }
  }
  publishChange(world, entity, type, archetype, row);
  return true;
}

// ---------------------------------------------------------------------------
// Deferring entry points
// ---------------------------------------------------------------------------
//
// Each mutation queues when a mutation scope is already open and otherwise
// opens one around its immediate form, so hook and observer work plays after
// it returns. A queued call reports true: the command was accepted. Callers
// that opened a scope themselves use the `Now` forms for their own work.

export function addTrait(world: World, entity: Entity, type: TypeId, value?: unknown): boolean {
  if (world.depth > 0) {
    enqueueAdd(world, entity, type, value);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = addTraitNow(world, entity, type, value);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

export function addTraits(world: World, entity: Entity, entries: readonly EntityEntry[]): void {
  if (world.depth > 0) {
    enqueueAddEntries(world, entity, entries);
    return;
  }
  beginMutation(world);
  try {
    addTraitsNow(world, entity, entries);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
}

export function removeTrait(world: World, entity: Entity, type: TypeId): boolean {
  if (world.depth > 0) {
    enqueueRemove(world, entity, type);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = removeTraitNow(world, entity, type);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

export function setTrait(world: World, entity: Entity, type: TypeId, value: unknown, notify = true): boolean {
  if (world.depth > 0) {
    enqueueSet(world, entity, type, value, notify);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = setTraitNow(world, entity, type, value, notify);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

/** `setTrait` for a validated handle. A queued call is checked again when it plays. */
export function setTraitUnchecked(world: World, entity: Entity, type: TypeId, value: unknown, notify = true): boolean {
  if (world.depth > 0) {
    enqueueSet(world, entity, type, value, notify);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = setTraitUncheckedNow(world, entity, type, value, notify);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

export function setValue(
  world: World,
  entity: Entity,
  type: TypeId,
  field: string,
  value: unknown,
  notify = true
): boolean {
  if (world.depth > 0) {
    enqueueSetValue(world, entity, type, field, value, notify);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = setValueNow(world, entity, type, field, value, notify);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}

export function markChanged(world: World, entity: Entity, type: TypeId): boolean {
  if (world.depth > 0) {
    enqueueChanged(world, entity, type);
    return true;
  }
  beginMutation(world);
  let result: boolean;
  try {
    result = markChangedNow(world, entity, type);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  return result;
}
