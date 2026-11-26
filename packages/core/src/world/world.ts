import { getOrderedSnapshot } from '../relation/ordered';
import { createQueryStore } from '../query/query-store';
import { subscribeSet } from './settled';
import { beginDefer, endDefer, runDeferred } from './defer';
import { $internal } from '../common';
import { subscribeMachine } from '../machine/machine';
import type { Machine, TransitionSubscriber } from '../machine/types';
import { assertOutsideDefer } from '../asserts';
import { applyDestroyEntity, createEntity, entityHas, subscribeTraitEvent } from '../entity/entity';
import type { Entity } from '../entity/types';
import {
  createEntityIndex,
  getAliveEntities,
  isEntityAlive,
  releaseOwnedPages,
} from '../entity/utils/entity-index';
import { getEntityId } from '../entity/utils/pack-entity';
import { addressSpace } from '../entity/utils/address-space';
import { createEmptyMaskGeneration } from '../entity/utils/paged-mask';
import { findIdentifiedEntity } from '../identifier/find-identified-entity';
import { isIdentifierPair, lookupAllIdentifiers, lookupIdentifier } from '../identifier/identifier';
import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import {
  lookupArgumentsScope,
  lookupScopedKey,
  lookupScopeStart,
} from '../identifier/scoped-identifier';
import {
  IsExcluded,
  resolveQueryInstance,
  resolveQueryInstanceFromRef,
  runQuery,
  runQueryFirst,
} from '../query/query';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { isQuery } from '../query/utils/is-query';
import { isStableParameter } from '../query/modifier';
import { getFirstEntityWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import {
  addTrait,
  getTrait,
  registerTrait,
  removeTrait,
  setTrait,
  upsertTrait,
} from '../trait/trait';
import { clearTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitInit,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { InlineQueryNode, World, WorldContext, WorldOptions } from './types';
import type { Subscriber } from '../trait/subscriptions';
import type { HookInput } from './utils/resolve-hook';

let nextWorldId = 0;

/** Registers IsExcluded and creates the world entity on first mutation. */
function ensureWorldRegistered(ctx: WorldContext): void {
  if (ctx.isRegistered) return;
  ctx.isRegistered = true;

  if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(ctx, IsExcluded);

  ctx.worldEntity = createEntity(ctx, [IsExcluded]);
  notifyWorldEntityChanged(ctx);
}

function notifyWorldEntityChanged(ctx: WorldContext) {
  for (const notify of ctx.resetSubscriptions) notify();
}

/** Inline and compiled queries share the live view for their membership and projection. */
export function queryWithParameters(ctx: WorldContext, params: QueryParameter[]) {
  const node = findInlineQuery(ctx, params);
  if (node !== null) return runQuery(ctx, node.query!, node.params!);

  const query = resolveQueryInstance(ctx, params);
  rememberInlineQuery(ctx, params, query);
  return runQuery(ctx, query, params);
}

/** One lookup per parameter, shared by full queries and first-match queries. */
function findInlineQuery(ctx: WorldContext, params: QueryParameter[]): InlineQueryNode | null {
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let next = node.next?.get(param);
    if (next === undefined) {
      // Fresh pair objects share a path by definition and target.
      if (isIdentifierPair(param)) {
        next = node.next?.get(param.identifier)?.next?.get(param.target);
      } else if (isRelationPair(param) && typeof param.target === 'number') {
        next = node.next?.get(param.relation as Relation<Trait>)?.next?.get(param.target);
      } else return null;
      if (next === undefined) return null;
    }
    node = next;
  }
  return node.query === null ? null : node;
}

/**
 * Lists a query under stable parameters, identifier keys and concrete relation targets. Queries that name a
 * target keep their tree entries so dropping the query can prune every path that reaches it.
 */
function rememberInlineQuery(ctx: WorldContext, params: QueryParameter[], query: QueryInstance) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param) || isIdentifierPair(param)) continue;
    if (!isRelationPair(param) || typeof param.target !== 'number') return;
  }
  let node = ctx.inlineQueries;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isStableParameter(param)) {
      node = inlineStep(node, param);
      continue;
    }
    if (isIdentifierPair(param)) {
      node = inlineStep(inlineStep(node, param.identifier), param.target);
      continue;
    }
    const pair = param as RelationPair;
    const relationStep = inlineStep(node, pair.relation as Relation<Trait>);
    node = inlineStep(relationStep, pair.target as Entity);
  }
  node.params = params;
  node.query = query;
  if (node.parent !== null) (query.inlineNodes ??= []).push(node);
}

function inlineStep(node: InlineQueryNode, key: QueryParameter | Relation<Trait> | IdentifierKey) {
  const next = (node.next ??= new Map());
  let child = next.get(key);
  if (child === undefined) {
    child = {
      next: null,
      params: null,
      query: null,
      parent:
        node.parent !== null || typeof key === 'number' || typeof key === 'string' ? node : null,
      key,
    };
    next.set(key, child);
  }
  return child;
}

export function createWorld(options?: WorldOptions): World {
  const retain = options?.retain ?? 1024;
  if (!Number.isSafeInteger(retain) || retain < 0) {
    throw new RangeError('Koota: retain must be a non-negative safe integer.');
  }
  const id = nextWorldId++;

  function clearStorage(ctx: WorldContext) {
    const ownedPages = ctx.entityIndex.ownedPages;
    releaseOwnedPages(ctx.entityIndex);
    ctx.entityIndex = createEntityIndex(addressSpace, ctx);
    // The finalizer follows the same list across resets and later registrations.
    ctx.entityIndex.ownedPages = ownedPages;

    ctx.entityMasks = [createEmptyMaskGeneration()];
    ctx.traitsByBit = [[]];
    ctx.bitflag = 1;
    ctx.defersChanges = false;

    for (const query of ctx.queriesHashMap.values()) {
      query.inlineNodes = null;
      if (query.cleanup === null) continue;
      for (let i = 0; i < query.cleanup.length; i++) query.cleanup[i]();
    }

    clearTraitInstance(ctx.traitInstances);
    ctx.traits.clear();
    ctx.relations.length = 0;

    ctx.queriesHashMap.clear();
    ctx.internalQuerySubscriptions = undefined;
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
  }

  /** Destroys every entity and clears registrations. Callers assert the scope first. */
  function clearWorld(recreate: boolean) {
    const ctx = world[$internal];
    beginDefer(ctx);
    try {
      world.entities.forEach((entity) => {
        if (isEntityAlive(ctx.entityIndex, entity)) {
          applyDestroyEntity(ctx, entity);
        }
      });

      clearStorage(ctx);
      ctx.worldEntity = recreate ? createEntity(ctx, [IsExcluded]) : null!;

      notifyWorldEntityChanged(ctx);
    } finally {
      endDefer(ctx);
    }
  }

  const world = {
    [$internal]: {
      entityIndex: null! as ReturnType<typeof createEntityIndex>,
      entityMasks: [createEmptyMaskGeneration()],
      retain,
      tombstones: { ids: [], head: 0 },
      pairRemovals: { entries: [], head: 0 },
      bitflag: 1,
      traitInstances: [],
      traitsByBit: [[]],
      traits: new Set<Trait>(),
      relations: [],
      queriesHashMap: new Map(),
      inlineQueries: { next: null, params: null, query: null, parent: null, key: null },
      queryInstances: [],
      iterationBuffers: undefined,
      actionInstances: [],
      notQueries: [],
      queryBatch: undefined,
      internalQuerySubscriptions: undefined,
      defersChanges: false,
      trackingRevision: 0,
      targetQueries: [],
      commands: [],
      commandCount: 0,
      unsettled: false,
      destroyQueue: [],
      targetFlags: [],
      destroying: undefined,
      worldEntity: null!,
      entitySubscribedInstances: new Set(),
      deferDepth: 0,
      settledCallbacks: undefined,
      settledQueue: [],
      settledCount: 0,
      settledRound: 0,
      getOrderedSnapshot,
      createQueryStore,
      resetSubscriptions: new Set(),
      entitySpawnSubscriptions: new Set(),
      entityDestroySubscriptions: new Set(),
      traitRegisteredSubscriptions: new Set(),
      isRegistered: false,
    } as WorldContext,

    spawn(...spawnTraits: ConfigurableTrait[]): Entity {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return createEntity(ctx, spawnTraits);
    },

    defer<T>(fn: () => T): T {
      return runDeferred(world[$internal], fn);
    },

    // Only the single key form is spliced in. A larger method stops inlining into callers and
    // the key pair then escapes into a real allocation.
    lookup(start: IdentifierPair | Entity, second?: IdentifierPair): Entity | undefined {
      const ctx = world[$internal];
      if (second === undefined) {
        return typeof start === 'number' ? undefined : lookupIdentifier(ctx, start);
      }
      if (arguments.length === 2) return lookupScopedKey(ctx, start, second);
      return lookupArgumentsScope(ctx, arguments, arguments.length);
    },

    lookupAll(start: IdentifierPair | Entity, second?: IdentifierPair): Entity[] {
      const ctx = world[$internal];
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

    has(target: Entity | Trait | Identifier | IdentifierPair): boolean {
      const ctx = world[$internal];
      if (ctx.worldEntity === null) return false;
      return typeof target === 'number'
        ? isEntityAlive(ctx.entityIndex, target)
        : entityHas(ctx, ctx.worldEntity, target);
    },

    add(...addTraits: ConfigurableTrait[]) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      addTrait(ctx, ctx.worldEntity, addTraits);
    },

    upsert<T extends Trait>(trait: T, value: TraitInit<ExtractSchema<T>>) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      upsertTrait(ctx, ctx.worldEntity, trait, value);
    },

    remove(...removeTraits: (Trait | Identifier | IdentifierPair)[]) {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;
      removeTrait(ctx, ctx.worldEntity, ...removeTraits);
    },

    get<T extends Trait>(trait: T, out?: Record<string, unknown>) {
      const ctx = world[$internal];
      if (ctx.worldEntity === null) return undefined;
      return getTrait(ctx, ctx.worldEntity, trait, out) as TraitRecord<ExtractSchema<T>> | undefined;
    },

    set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      setTrait(ctx, ctx.worldEntity, trait, value, true);
    },

    destroy() {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;
      assertOutsideDefer(ctx, 'world.destroy');
      try {
        clearWorld(false);
      } finally {
        // Reads by settled callbacks use the empty world until teardown finishes.
        if (ctx.worldEntity === null) {
          ctx.isRegistered = false;
          // A settled callback can spawn after the original pages were released.
          if (ctx.entityIndex.ownedPages.length !== 0) clearStorage(ctx);
        }
      }
    },

    reset() {
      const ctx = world[$internal];
      if (!ctx.isRegistered) return;
      assertOutsideDefer(ctx, 'world.reset');
      clearWorld(true);
    },

    query(...args: any[]) {
      const ctx = world[$internal];
      if (!ctx.isRegistered) ensureWorldRegistered(ctx);

      if (args.length === 1 && isQuery(args[0])) {
        const queryRef = args[0];
        const query = ctx.queryInstances[queryRef.id] ?? resolveQueryInstanceFromRef(ctx, queryRef);
        return runQuery(ctx, query, queryRef.parameters);
      }
      return queryWithParameters(ctx, args);
    },

    queryFirst(...args: [Query<QueryParameter[]>] | QueryParameter[]) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);

      if (args.length === 1) {
        const arg = args[0];
        if (isQuery(arg)) return runQueryFirst(ctx, resolveQueryInstanceFromRef(ctx, arg));
        if (isRelationPair(arg) && typeof arg.target === 'number') {
          const id = getEntityId(arg.target);
          // An existing query may have reordered its members as sources entered or left.
          if (!ctx.targetQueries[id >>> 10]?.[id & 1023]?.length) {
            return getFirstEntityWithRelationTo(ctx, arg.relation as Relation<Trait>, arg.target);
          }
        }
      }

      const node = findInlineQuery(ctx, args as QueryParameter[]);
      if (node !== null) return runQueryFirst(ctx, node.query!);

      const identified = findIdentifiedEntity(ctx, args as QueryParameter[]);
      if (identified !== null) return identified;

      const query = resolveQueryInstance(ctx, args as QueryParameter[]);
      rememberInlineQuery(ctx, args as QueryParameter[], query);
      return runQueryFirst(ctx, query);
    },

    onEnter(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      const query = isQuery(args)
        ? resolveQueryInstanceFromRef(ctx, args)
        : resolveQueryInstance(ctx, args);
      return subscribeSet(ctx, (query.addSubscriptions ??= new Set()), callback);
    },

    onExit(
      args: Query<QueryParameter[]> | QueryParameter[],
      callback: (entity: Entity) => void
    ): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      const query = isQuery(args)
        ? resolveQueryInstanceFromRef(ctx, args)
        : resolveQueryInstance(ctx, args);
      return subscribeSet(ctx, (query.removeSubscriptions ??= new Set()), callback);
    },

    onAdd(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return subscribeTraitEvent(ctx, undefined, 'addSubscriptions', trait, callback);
    },

    onRemove(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return subscribeTraitEvent(ctx, undefined, 'removeSubscriptions', trait, callback);
    },

    onChange(trait: HookInput, callback: Subscriber<any>): QueryUnsubscriber {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return subscribeTraitEvent(ctx, undefined, 'changeSubscriptions', trait, callback);
    },

    onTransition(machine: Machine, callback: TransitionSubscriber) {
      const ctx = world[$internal];
      ensureWorldRegistered(ctx);
      return subscribeMachine(ctx, machine, callback);
    },

    onEntitySpawn(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      return subscribeSet(ctx, ctx.entitySpawnSubscriptions, callback);
    },

    onEntityDestroy(callback: (entity: Entity) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      return subscribeSet(ctx, ctx.entityDestroySubscriptions, callback);
    },

    onTraitRegistered(callback: (trait: Trait) => void): QueryUnsubscriber {
      const ctx = world[$internal];
      return subscribeSet(ctx, ctx.traitRegisteredSubscriptions, callback);
    },
  } as World;

  const index = createEntityIndex(addressSpace, world[$internal]);
  world[$internal].entityIndex = index;
  addressSpace.worldFinalizer.register(world, index.ownedPages);

  // Accessors are added after the literal. Redefining a literal data property
  // as a getter would drop the world into V8 dictionary mode.
  Object.defineProperty(world, 'retain', {
    get: () => world[$internal].retain,
    enumerable: true,
  });

  Object.defineProperty(world, 'traits', {
    get: () => world[$internal].traits,
    enumerable: true,
  });

  Object.defineProperty(world, 'id', {
    get: () => id,
    enumerable: true,
  });
  Object.defineProperty(world, 'isRegistered', {
    get: () => world[$internal].isRegistered,
    enumerable: true,
  });
  Object.defineProperty(world, 'entities', {
    get: () => getAliveEntities(world[$internal].entityIndex),
    enumerable: true,
  });

  return world;
}
