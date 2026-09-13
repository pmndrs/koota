import { archetypeKey, createArchetype, insertType, type Archetype } from './archetype';
import { abortMutation, beginMutation, createCommandQueue, discardCommands, endMutation, type CommandQueue } from './commands';
import { destroyEntityNow, getEntities, RESERVED, retireSlot } from './entity';
import { filterArchetypeCreated, filterArchetypeDestroyed, type Filter } from './filter';
import { PAIR_FLAG, type Entity, type TypeId } from './id';
import { createObserverState, fire, type ObserverState } from './observer';
import type { Store } from './store';
import type { Query } from './query';

export type World = {
  alive: boolean;
  /** Owned by the layer above, so global hooks can find its state from a kernel world. */
  context: unknown;
  /** Entity index, flat and indexed by entity index. Index 0 is unused. */
  generations: Uint8Array;
  archetypeOf: Int32Array;
  rowOf: Int32Array;
  /** Next fresh index. */
  next: number;
  /** Recycled indices whose generation has not retired. */
  free: number[];
  aliveCount: number;
  /** Indices with a destruction in progress, for cascade cycle protection. */
  destroying: Set<number>;
  /** Open mutation scopes. Mutations issued while one is open queue. */
  depth: number;
  /** The queue is playing. */
  flushing: boolean;
  queue: CommandQueue;

  root: Archetype;
  archetypes: (Archetype | null)[];
  archetypeByKey: Map<string, Archetype>;
  /** Type to the archetypes containing it. */
  recordsByType: Map<TypeId, Archetype[]>;

  /** Storage outside archetypes by type id: concrete pairs and sparse traits. */
  stores: Map<TypeId, Store>;
  /** Pair stores by target index, for cleanup when the target dies. */
  pairsByTarget: Map<number, Store[]>;
  /** Per entity index: `[type, row, type, row, ...]` for every external type the entity holds. */
  externals: (number[] | undefined)[];

  filters: Map<string, Filter>;
  filtersByType: Map<TypeId, Filter[]>;
  /** Filters with no included type. */
  filtersAll: Filter[];

  queries: Map<string, Query>;
  /** Observed queries split by kind: static ones diff archetype bitsets, dynamic ones re-evaluate. */
  observedStatic: Query[];
  observedDynamic: Query[];
  /** Bumped whenever the observed static list changes, invalidating archetype bitsets. */
  observedEpoch: number;
  /** Tracking queries by tracked type. */
  trackingByType: Map<TypeId, Query[]>;
  /** Removal revisions by type, for `removed()` terms. */
  removed: Map<TypeId, Map<Entity, number>>;
  /** Revision counters: traits by id, pairs by map. */
  traitVersions: number[];
  pairVersions: Map<TypeId, number>;

  /** Default exclusions applied to every query. */
  readonly exclude: readonly TypeId[];
  observers: ObserverState;
};

export type WorldOptions = { exclude?: readonly TypeId[] };

const INITIAL_ENTITY_CAPACITY = 256;

export function createWorld(options?: WorldOptions): World {
  const world: World = {
    alive: true,
    context: null,
    generations: new Uint8Array(INITIAL_ENTITY_CAPACITY),
    archetypeOf: new Int32Array(INITIAL_ENTITY_CAPACITY).fill(-1),
    rowOf: new Int32Array(INITIAL_ENTITY_CAPACITY),
    next: 1,
    free: [],
    aliveCount: 0,
    destroying: new Set(),
    depth: 0,
    flushing: false,
    queue: createCommandQueue(),
    root: null!,
    archetypes: [],
    archetypeByKey: new Map(),
    recordsByType: new Map(),
    stores: new Map(),
    pairsByTarget: new Map(),
    externals: [],
    filters: new Map(),
    filtersByType: new Map(),
    filtersAll: [],
    queries: new Map(),
    observedStatic: [],
    observedDynamic: [],
    observedEpoch: 0,
    trackingByType: new Map(),
    removed: new Map(),
    traitVersions: [],
    pairVersions: new Map(),
    exclude: options?.exclude ? [...new Set(options.exclude)].sort((a, b) => a - b) : [],
    observers: createObserverState(),
  };
  world.root = registerArchetype(world, []);
  return world;
}

export function ensureEntityCapacity(world: World, index: number): void {
  const length = world.generations.length;
  if (index < length) return;
  let capacity = length;
  while (capacity <= index) capacity *= 2;
  const generations = new Uint8Array(capacity);
  generations.set(world.generations);
  const archetypeOf = new Int32Array(capacity).fill(-1);
  archetypeOf.set(world.archetypeOf);
  const rowOf = new Int32Array(capacity);
  rowOf.set(world.rowOf);
  world.generations = generations;
  world.archetypeOf = archetypeOf;
  world.rowOf = rowOf;
}

export function archetypeAt(world: World, index: number): Archetype {
  return world.archetypes[world.archetypeOf[index]]!;
}

export function registerArchetype(world: World, types: readonly TypeId[]): Archetype {
  const archetype = createArchetype(world.archetypes.length, types);
  world.archetypes.push(archetype);
  world.archetypeByKey.set(archetype.key, archetype);
  for (let i = 0; i < types.length; i++) {
    let records = world.recordsByType.get(types[i]);
    if (!records) world.recordsByType.set(types[i], (records = []));
    records.push(archetype);
  }
  filterArchetypeCreated(world, archetype);
  fire(world, 'archetypeCreated', archetype);
  return archetype;
}

export function destroyArchetype(world: World, archetype: Archetype): void {
  if (archetype === world.root || world.archetypes[archetype.id] !== archetype) return;
  filterArchetypeDestroyed(world, archetype);
  fire(world, 'archetypeDestroyed', archetype);
  world.archetypeByKey.delete(archetype.key);
  world.archetypes[archetype.id] = null;
  const types = archetype.types;
  for (let i = 0; i < types.length; i++) {
    const records = world.recordsByType.get(types[i]);
    if (!records) continue;
    const index = records.indexOf(archetype);
    if (index >= 0) records.splice(index, 1);
    if (records.length === 0) world.recordsByType.delete(types[i]);
  }
  if (archetype.edges) {
    for (const [type, other] of archetype.edges) other.edges?.delete(type);
    archetype.edges = null;
  }
}

export function ensureArchetype(world: World, types: readonly TypeId[]): Archetype {
  return world.archetypeByKey.get(archetypeKey(types)) ?? registerArchetype(world, types);
}

function link(from: Archetype, to: Archetype, type: TypeId): Archetype {
  (from.edges ??= new Map()).set(type, to);
  (to.edges ??= new Map()).set(type, from);
  return to;
}

export function traverseAdd(world: World, from: Archetype, type: TypeId): Archetype {
  if (from.records.has(type)) return from;
  const cached = from.edges?.get(type);
  if (cached) return cached;
  return link(from, ensureArchetype(world, insertType(from.types, type)), type);
}

export function traverseRemove(world: World, from: Archetype, type: TypeId): Archetype {
  if (!from.records.has(type)) return from;
  const cached = from.edges?.get(type);
  if (cached) return cached;
  return link(
    from,
    ensureArchetype(
      world,
      from.types.filter((candidate) => candidate !== type)
    ),
    type
  );
}

export function bumpVersion(world: World, type: TypeId): void {
  if (type < PAIR_FLAG) world.traitVersions[type] = (world.traitVersions[type] | 0) + 1;
  else world.pairVersions.set(type, (world.pairVersions.get(type) ?? 0) + 1);
}

export function getTypeVersion(world: World, type: TypeId): number {
  if (type < PAIR_FLAG) return world.traitVersions[type] | 0;
  return world.pairVersions.get(type) ?? 0;
}

/**
 * Destroys every entity, firing lifecycle events, then clears archetypes,
 * filters, queries, and history. Observers and the entity generations survive,
 * so old handles stay dead.
 */
export function resetWorld(world: World): void {
  if (world.depth > 0 || world.flushing) throw new Error('Koota: Cannot reset a world during a mutation.');
  beginMutation(world);
  try {
    const entities = getEntities(world);
    for (let i = 0; i < entities.length; i++) destroyEntityNow(world, entities[i]);
  } catch (error) {
    abortMutation(world);
    throw error;
  }
  endMutation(world);
  discardCommands(world);
  // Reservations never created retire, so their handles stay dead.
  for (let index = 1; index < world.next; index++) {
    if (world.archetypeOf[index] === RESERVED) retireSlot(world, index);
  }
  for (const query of world.queries.values()) {
    for (let i = 0; i < query.targets.length; i++) query.targets[i].unsubscribe?.();
  }
  const archetypes = world.archetypes;
  for (let i = 0; i < archetypes.length; i++) {
    const archetype = archetypes[i];
    if (archetype) archetype.edges = null;
  }
  archetypes.length = 0;
  world.archetypeByKey.clear();
  world.recordsByType.clear();
  world.stores.clear();
  world.pairsByTarget.clear();
  world.externals.length = 0;
  world.filters.clear();
  world.filtersByType.clear();
  world.filtersAll.length = 0;
  world.queries.clear();
  world.observedStatic.length = 0;
  world.observedDynamic.length = 0;
  world.observedEpoch++;
  world.trackingByType.clear();
  world.removed.clear();
  world.traitVersions.length = 0;
  world.pairVersions.clear();
  world.destroying.clear();
  world.root = registerArchetype(world, []);
  fire(world, 'worldReset');
}

export function destroyWorld(world: World): void {
  if (!world.alive) return;
  resetWorld(world);
  world.alive = false;
}
