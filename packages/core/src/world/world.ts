import { assertsEnabled } from '../build-flags';
import { assertOutsideDefer, beginDefer, endDefer, runDeferred } from '../command/buffer';
import { applyDestroyEntity, createEntity, destroyEntity } from '../entity/entity';
import {
  createEntityIndex,
  createEntityNotAliveError,
  getAliveEntities,
  isEntityAlive,
  releaseOwnedPages,
} from '../entity/entity-index';
import { subscribeEntityDestroy, subscribeEntitySpawn } from '../entity/hooks';
import { installEntityMethods } from '../entity/methods';
import { closedAllocator, createPageAllocator, sharedAllocator } from '../entity/page-allocator';
import type { Entity, PageAllocator } from '../entity/types';
import { lookupAllIdentifiers, lookupIdentifier } from '../identifier/ownership';
import { lookupArgumentsScope, lookupScopedKey, lookupScopeStart } from '../identifier/scope';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { $internal } from '../internal';
import { subscribeTransition } from '../machine/hooks';
import type { Machine, TransitionSubscriber } from '../machine/types';
import { subscribeEnter, subscribeExit } from '../query/hooks';
import { createQueryStore } from '../query/store';
import { IsExcluded } from '../query/terms';
import { growTrackerTables } from '../query/tracking';
import type { Query, QueryParameter, QueryUnsubscriber } from '../query/types';
import { query, queryFirst } from '../query/view';
import type { Relation, RelationPair } from '../relation/types';
import {
  subscribeAdd,
  subscribeChange,
  subscribeRemove,
  subscribeTraitRegistered,
} from '../trait/hooks';
import { clearMaskPages, growMaskTables, releaseMaskSlots } from '../trait/mask-table';
import {
  addTrait,
  hasTrait,
  getTraitTarget,
  getTraitTargets,
  getTrait,
  removeTrait,
  setTraitChanged,
  setTrait,
  upsertTrait,
} from '../trait/ops';
import { clearTraitInstances } from '../trait/registry';
import type { ConfigurableTrait, Subscriber, Trait, TraitHookInput } from '../trait/types';
import type { World, WorldContext, WorldOptions } from './types';

let nextWorldId = 0;

/**
 * Creates a world whose entities carry methods, so entity.get(Position) works without the world
 * at hand. Worlds created here share one id space, which is how a method finds the world that
 * owns its entity. That table holds a world until it is destroyed.
 */
export function createWorld(options?: WorldOptions): World {
  installEntityMethods();
  return createWorldWithAllocator(sharedAllocator, options);
}

/**
 * Creates a world that owns its allocator. Nothing outside the world refers to it, so dropping
 * the last reference frees it. Its entities carry no methods and only mean something to this
 * world. A program must not mix these with worlds from createWorld, since an entity method
 * cannot tell the two apart and reaches whichever shared world holds that id.
 */
export function createIsolatedWorld(options?: WorldOptions): World {
  return createWorldWithAllocator(createPageAllocator([]), options);
}

/** The allocator decides where entity ids come from, shared between worlds or owned by this one. */
function createWorldWithAllocator(allocator: PageAllocator, options?: WorldOptions): World {
  const ctx = createWorldContext(allocator, options);
  const id = nextWorldId++;
  // Every world has the same properties in the same order, so all worlds share one hidden class.
  return Object.create(worldMethods, {
    [$internal]: { value: ctx },
    id: { value: id, enumerable: true },
    retain: { value: ctx.retain, enumerable: true },
    traits: { value: ctx.traits, enumerable: true },
    entities: { get: getEntities, enumerable: true },
  }) as World;
}

function createWorldContext(allocator: PageAllocator, options?: WorldOptions): WorldContext {
  const retain = options?.retain ?? 1024;
  if (!Number.isSafeInteger(retain) || retain < 0) {
    throw new RangeError('Koota: retain must be a non-negative safe integer.');
  }

  const ctx = {
    entityIndex: null! as ReturnType<typeof createEntityIndex>,
    entityMasks: [],
    pageLimit: 0,
    retain,
    tombstones: { ids: [], head: 0 },
    pairRemovals: { entries: [], head: 0 },
    traitInstances: [],
    traitsByBit: [],
    traits: new Set<Trait>(),
    relations: [],
    queriesHashMap: new Map(),
    inlineQueries: { next: null, params: null, query: null, parent: null, key: null },
    queryInstances: [],
    iterationBuffers: undefined,
    actionInstances: [],
    notQueries: [],
    queryBatch: undefined,
    targetQuerySubscriptions: undefined,
    defersChanges: false,
    trackingRevision: 0,
    targetQueries: [],
    commands: [],
    commandCount: 0,
    unsettled: false,
    destroyQueue: [],
    targetFlags: [],
    destroying: undefined,
    worldEntity: null,
    destroyed: false,
    entitySubscribedInstances: new Set(),
    deferDepth: 0,
    settledCallbacks: undefined,
    settledQueue: [],
    settledCount: 0,
    settledRound: 0,
    createQueryStore,
    resetSubscriptions: new Set(),
    entitySpawnSubscriptions: new Set(),
    entityDestroySubscriptions: new Set(),
    traitRegisteredSubscriptions: new Set(),
  } as WorldContext;

  ctx.entityIndex = createEntityIndex(allocator, ctx, growPageTables);
  ctx.worldEntity = createEntity(ctx, [IsExcluded]);

  return ctx;
}

function getEntities(this: World): Entity[] {
  return getAliveEntities(this[$internal].entityIndex);
}

/**
 * The methods of every world. They are one set of functions that find the context through the
 * world they are called on, so a call site that serves several worlds still sees one function.
 * A method must be called on its world and does not work once detached from it. Every entity
 * operation takes the entity first. Without one it applies to the world itself.
 */
const worldMethods: ThisType<World> = {
  spawn(...spawnTraits: ConfigurableTrait[]): Entity {
    const ctx = this[$internal];
    return createEntity(ctx, spawnTraits);
  },

  defer<T>(fn: () => T): T {
    return runDeferred(this[$internal], fn);
  },

  // Only the single key form is spliced in. A larger method stops inlining into callers and
  // the key pair then escapes into a real allocation.
  lookup(start: IdentifierPair | Entity, second?: IdentifierPair): Entity | undefined {
    const ctx = this[$internal];
    if (second === undefined) {
      return typeof start === 'number' ? undefined : lookupIdentifier(ctx, start);
    }
    if (arguments.length === 2) return lookupScopedKey(ctx, start, second);
    return lookupArgumentsScope(ctx, arguments, arguments.length);
  },

  lookupAll(start: IdentifierPair | Entity, second?: IdentifierPair): Entity[] {
    const ctx = this[$internal];
    if (second === undefined) {
      return typeof start === 'number' ? [] : lookupAllIdentifiers(ctx, start, undefined);
    }
    const last = arguments.length - 1;
    const scope =
      last === 1 ? lookupScopeStart(ctx, start) : lookupArgumentsScope(ctx, arguments, last);
    return scope === undefined
      ? []
      : lookupAllIdentifiers(ctx, arguments[last] as IdentifierPair, scope);
  },

  has(
    target: Entity | Trait | RelationPair | Identifier | IdentifierPair,
    trait?: Trait | RelationPair | Identifier | IdentifierPair
  ): boolean {
    const ctx = this[$internal];
    if (typeof target === 'number') {
      // A lone entity is a liveness check. Assertions count the arguments, so a trait that is
      // undefined by mistake reaches the trait check and throws.
      if (trait === undefined && (!assertsEnabled || arguments.length === 1)) {
        return isEntityAlive(ctx.entityIndex, target);
      }
      return hasTrait(ctx, target, trait!);
    }
    return hasWorldTrait(ctx, target);
  },

  add(first?: Entity | ConfigurableTrait, ...traits: ConfigurableTrait[]) {
    const ctx = this[$internal];
    if (typeof first === 'number') addTrait(ctx, first, traits);
    else addWorldTrait(ctx, first, traits);
  },

  upsert(first: Entity | Trait, second: any, value?: any) {
    const ctx = this[$internal];
    if (typeof first === 'number') upsertTrait(ctx, first, second, value);
    else upsertWorldTrait(ctx, first, second);
  },

  remove(
    first?: Entity | Trait | RelationPair | Identifier | IdentifierPair,
    ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
  ) {
    const ctx = this[$internal];
    if (typeof first === 'number') {
      if (ctx.destroyed) return;
      removeTrait(ctx, first, ...traits);
    } else removeWorldTrait(ctx, first, traits);
  },

  get(
    first: Entity | Trait,
    second?: Trait | RelationPair | Record<string, unknown>,
    out?: Record<string, unknown>
  ) {
    const ctx = this[$internal];
    if (typeof first === 'number') return getTrait(ctx, first, second as Trait | RelationPair, out);
    return getWorldTrait(ctx, first, second as Record<string, unknown> | undefined);
  },

  set(first: Entity | Trait, second: any, value?: any, flagChanged = true) {
    const ctx = this[$internal];
    if (typeof first === 'number') setTrait(ctx, first, second, value, flagChanged);
    else setWorldTrait(ctx, first, second);
  },

  changed(first: Entity | Trait, trait?: Trait) {
    const ctx = this[$internal];
    if (typeof first === 'number') setTraitChanged(ctx, first, trait!);
    else setWorldTraitChanged(ctx, first);
  },

  targetFor(entity: Entity, relation: Relation<Trait> | Identifier) {
    return getTraitTarget(this[$internal], entity, relation);
  },

  targetsFor(entity: Entity, relation: Relation<Trait> | Identifier) {
    return getTraitTargets(this[$internal], entity, relation);
  },

  // The argument count tells the two forms apart, so an undefined entity never destroys the world.
  destroy(entity?: Entity) {
    const ctx = this[$internal];
    if (typeof entity === 'number') {
      destroyEntity(ctx, entity);
      return;
    }
    if (arguments.length !== 0) throw createEntityNotAliveError(entity!);
    // Destroying is final. A second call finds nothing left to do.
    if (ctx.destroyed) return;
    assertOutsideDefer(ctx, 'world.destroy');
    clearWorld(ctx, false);
  },

  reset() {
    const ctx = this[$internal];
    assertNotDestroyed(ctx);
    assertOutsideDefer(ctx, 'world.reset');
    clearWorld(ctx, true);
  },

  query,

  queryFirst,

  onEnter(
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
  ): QueryUnsubscriber {
    return subscribeEnter(this[$internal], args, callback);
  },

  onExit(
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
  ): QueryUnsubscriber {
    return subscribeExit(this[$internal], args, callback);
  },

  onAdd(first: Entity | TraitHookInput, second: any, callback?: Subscriber<any>): QueryUnsubscriber {
    return subscribe(this[$internal], subscribeAdd, first, second, callback);
  },

  onRemove(
    first: Entity | TraitHookInput,
    second: any,
    callback?: Subscriber<any>
  ): QueryUnsubscriber {
    return subscribe(this[$internal], subscribeRemove, first, second, callback);
  },

  onChange(
    first: Entity | TraitHookInput,
    second: any,
    callback?: Subscriber<any>
  ): QueryUnsubscriber {
    return subscribe(this[$internal], subscribeChange, first, second, callback);
  },

  onTransition(first: Entity | Machine, second: any, callback?: TransitionSubscriber) {
    const ctx = this[$internal];
    if (typeof first === 'number') return subscribeTransition(ctx, second, callback!, first);
    return subscribeTransition(ctx, first, second);
  },

  onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
    return subscribeEntitySpawn(this[$internal], callback);
  },

  onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
    return subscribeEntityDestroy(this[$internal], callback);
  },

  onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
    return subscribeTraitRegistered(this[$internal], callback);
  },
};

/** Each domain that keeps tables by page extends its own to the world's new page limit. */
function growPageTables(ctx: WorldContext, pageLimit: number) {
  growMaskTables(ctx, pageLimit);
  growTrackerTables(ctx, pageLimit);
}

/** Drops every entity, trait instance and query. Reset then starts over with a new world entity. */
function clearWorld(ctx: WorldContext, recreate: boolean) {
  beginDefer(ctx);
  try {
    getAliveEntities(ctx.entityIndex).forEach((entity) => {
      if (isEntityAlive(ctx.entityIndex, entity)) {
        applyDestroyEntity(ctx, entity);
      }
    });

    // Clear shared pages before their ids can be leased by another world.
    if (ctx.entityIndex.allocator === sharedAllocator) {
      clearMaskPages(ctx.entityMasks, ctx.entityIndex.ownedPages);
      // Every shared world registers IsExcluded for its world entity.
      releaseMaskSlots(ctx.traits, IsExcluded[$internal].sharedMask.users === 1);
      // Reset leases its pages again and grows the new tables to match.
      if (recreate) ctx.pageLimit = 0;
    }
    ctx.entityMasks = [];
    ctx.traitsByBit = [];

    releaseOwnedPages(ctx.entityIndex);
    ctx.entityIndex = createEntityIndex(
      recreate ? ctx.entityIndex.allocator : closedAllocator,
      ctx,
      growPageTables
    );

    ctx.defersChanges = false;

    for (const query of ctx.queriesHashMap.values()) {
      query.inlineNodes = null;
      if (query.cleanup === null) continue;
      for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
    }

    clearTraitInstances(ctx.traitInstances);
    ctx.traits.clear();
    ctx.relations.length = 0;

    ctx.queriesHashMap.clear();
    ctx.targetQuerySubscriptions = undefined;
    ctx.inlineQueries = { next: null, params: null, query: null, parent: null, key: null };
    ctx.queryInstances.length = 0;
    ctx.tombstones.head = 0;
    ctx.tombstones.ids.length = 0;
    ctx.pairRemovals.head = 0;
    ctx.pairRemovals.entries.length = 0;
    ctx.iterationBuffers = undefined;
    ctx.actionInstances.length = 0;
    ctx.notQueries.length = 0;
    ctx.targetQueries.length = 0;

    ctx.entitySubscribedInstances.clear();

    // A destroyed world has no world entity, so it holds no page another world could use.
    ctx.worldEntity = recreate ? createEntity(ctx, [IsExcluded]) : null;
    ctx.destroyed = !recreate;

    for (const sub of ctx.resetSubscriptions) {
      sub();
    }
  } finally {
    endDefer(ctx);
  }
}

// The forms without an entity apply to the world entity. They stay out of line so the entity
// forms above keep their inlining budget. A destroyed world has no world entity, so reads and
// removals find nothing and writes throw.
function assertNotDestroyed(ctx: WorldContext) {
  if (ctx.destroyed) throw new Error('Koota: The world was destroyed.');
}

function getWorldEntity(ctx: WorldContext): Entity {
  assertNotDestroyed(ctx);
  return ctx.worldEntity!;
}

/**
 * A missing entity lands in the world forms, where its place is taken by a trait. Report it as
 * the dead entity it is instead of applying the call to the world.
 */
function assertTrait(trait: unknown) {
  if (trait == null) throw createEntityNotAliveError(trait as unknown as Entity);
}

/**
 * Adding or removing nothing is allowed. An undefined followed by traits is a missing entity.
 * Returns whether there is work to do.
 */
function assertTraitOrEmpty(first: unknown, rest: unknown[]): boolean {
  if (first != null) return true;
  if (rest.length !== 0) throw createEntityNotAliveError(first as unknown as Entity);
  return false;
}

function hasWorldTrait(
  ctx: WorldContext,
  trait: Trait | RelationPair | Identifier | IdentifierPair
): boolean {
  assertTrait(trait);
  return ctx.worldEntity !== null && hasTrait(ctx, ctx.worldEntity, trait);
}

function addWorldTrait(
  ctx: WorldContext,
  first: ConfigurableTrait | undefined,
  traits: ConfigurableTrait[]
) {
  if (!assertTraitOrEmpty(first, traits)) return;
  traits.unshift(first!);
  addTrait(ctx, getWorldEntity(ctx), traits);
}

function upsertWorldTrait(ctx: WorldContext, trait: Trait, value: any) {
  assertTrait(trait);
  upsertTrait(ctx, getWorldEntity(ctx), trait, value);
}

function removeWorldTrait(
  ctx: WorldContext,
  first: Trait | RelationPair | Identifier | IdentifierPair | undefined,
  traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  if (!assertTraitOrEmpty(first, traits) || ctx.worldEntity === null) return;
  traits.unshift(first!);
  removeTrait(ctx, ctx.worldEntity, ...traits);
}

function getWorldTrait(ctx: WorldContext, trait: Trait, out: Record<string, unknown> | undefined) {
  assertTrait(trait);
  return ctx.worldEntity === null ? undefined : getTrait(ctx, ctx.worldEntity, trait, out);
}

function setWorldTraitChanged(ctx: WorldContext, trait: Trait) {
  assertTrait(trait);
  if (ctx.worldEntity !== null) setTraitChanged(ctx, ctx.worldEntity, trait);
}

function setWorldTrait(ctx: WorldContext, trait: Trait, value: any) {
  assertTrait(trait);
  setTrait(ctx, getWorldEntity(ctx), trait, value, true);
}

/** Attaches to a trait hook for every entity, or for one when an entity comes first. */
function subscribe(
  ctx: WorldContext,
  attach: typeof subscribeAdd,
  first: Entity | TraitHookInput,
  second: TraitHookInput | Subscriber<any>,
  callback: Subscriber<any> | undefined
): QueryUnsubscriber {
  if (typeof first === 'number') {
    return attach(ctx, first, second as TraitHookInput, callback!);
  }
  assertTrait(first);
  return attach(ctx, undefined, first, second as Subscriber<any>);
}
