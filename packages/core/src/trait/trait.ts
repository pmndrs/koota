import { endStructuralChanges } from '../world/settled';
import type { EventType, QueryInstance } from '../query/types';
import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive, assertRelationTarget, createTraitNotPresentError } from '../asserts';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import {
  addIdentifierPair,
  isIdentifier,
  hasIdentifier,
  reconcileKeyQueries,
  releaseIdentifier,
} from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { notifyTraitAdded, notifyTraitChanged, setPairChanged } from '../query/modifiers/changed';
import { addEntityToQuery, reconcileAnchoredQueries, removeEntityFromQuery } from '../query/query';
import { checkQuery } from '../query/utils/check-query';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import { clearPendingChanges } from '../query/utils/mark-tracked-trait-changed';
import { checkQueryWithFilters } from '../query/utils/check-query-filters';
import { isOrderedTrait, setupOrderedTraitSync } from '../relation/ordered';
import {
  addRelationTarget,
  detachRelationTargets,
  reconcileRelationQueries,
  getFirstRelationTarget,
  getRelationData,
  getRelationTargets,
  getTargetIndex,
  hasRelationToTarget,
  initRelationData,
  removeAllRelationTargets,
  removeRelationTarget,
  setRelationData,
  setRelationDataAtIndex,
} from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { EMPTY_MASK_PAGE, REMOVED_WORD, materializeMaskPage } from '../entity/utils/paged-mask';
import {
  createAddFunction,
  createGetFunction,
  createGetIntoFunction,
  createRecordFunction,
  createSetFunction,
  createStore,
  Norm,
  Schema,
  StoreType,
  TraitSchema,
  validateSchema,
} from '../storage';
import type { World, WorldContext } from '../world';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { createSubscriptions, emit } from './subscriptions';
import { getTraitInstance, hasTraitInstance, setTraitInstance } from './trait-instance';
import { createClearFunction } from '../storage/stores';
import type {
  ConfigurableTrait,
  ExtractStore,
  TagTrait,
  Trait,
  TraitAccessors,
  TraitContext,
  TraitInstance,
  TraitValue,
} from './types';

const tagSchema = Object.freeze({});
let traitId = 0;

/**
 * Create standard paged storage accessors, then allow typed overrides to delegate to them.
 * Storage layout and allocation stay with the core.
 */
export function createTraitContext<S extends Schema>(
  schema: S,
  customize?: (defaults: Readonly<TraitAccessors<S>>) => Partial<TraitAccessors<S>>
): TraitContext<S> {
  const isAoS = typeof schema === 'function';
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const type: StoreType = isAoS ? 'aos' : isTag ? 'tag' : 'soa';

  validateSchema(schema);

  const defaults: TraitAccessors<S> = {
    add: createAddFunction[type](schema),
    set: createSetFunction[type](schema),
    get: createGetFunction[type](schema),
    getInto: createGetIntoFunction[type](schema),
    remove: () => {},
  };
  const accessors = customize?.(defaults);
  const get = accessors?.get;

  return {
    id: traitId++,
    createStore: () => createStore(schema),
    clear: createClearFunction(schema),
    add: accessors?.add ?? defaults.add,
    set: accessors?.set ?? defaults.set,
    get: get ?? defaults.get,
    // A custom get owns how values are read, so without a custom getInto, out is filled from its record.
    getInto:
      accessors?.getInto ??
      (get
        ? (ctx, index, store, out) => Object.assign(out, get(ctx, index, store))
        : defaults.getInto),
    remove: accessors?.remove ?? defaults.remove,
    relation: null,
    isIdentifier: false,
    type,
    cursor:
      type === 'soa' &&
      accessors === undefined &&
      Object.keys(schema).every((key) => !Array.isArray((schema as Record<string, unknown>)[key])),
  };
}

/** Define the public id, schema and record builder as read-only properties on a trait object. */
export function defineTraitProperties(target: object, context: TraitContext, schema: Schema) {
  Object.defineProperty(target, 'id', {
    value: context.id,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(target, 'schema', {
    value: schema,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  // Most traits never build a record, so the builder compiles on first use.
  let create: (() => unknown) | undefined;
  Object.defineProperty(target, 'record', {
    value: () => (create ??= createRecordFunction[context.type](schema))(),
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

function createTrait(schema?: undefined | Record<string, never>): TagTrait;
function createTrait<S extends TraitSchema>(schema: S): Trait<Norm<S>>;
function createTrait<S extends TraitSchema>(schema: S = tagSchema as S): Trait<Norm<S>> {
  const context = createTraitContext(schema);
  const Trait = Object.assign(
    (params: TraitValue<Norm<S>>): [Trait<Norm<S>>, TraitValue<Norm<S>>] => [Trait, params],
    { [$internal]: context }
  ) as Trait<Norm<S>>;

  defineTraitProperties(Trait, context, schema);

  return Trait;
}

export const trait = createTrait;

export function registerTrait(ctx: WorldContext, trait: Trait) {
  const traitCtx = trait[$internal];

  const data: TraitInstance = {
    version: 0,
    generationId: ctx.entityMasks.length - 1,
    bitflag: ctx.bitflag,
    trait,
    store: traitCtx.createStore(),
    queries: [],
    trackingQueries: [],
    relationQueries: [],
    anchorRelations: [],
    schema: trait.schema,
    changeSubscriptions: createSubscriptions(),
    addSubscriptions: createSubscriptions(),
    removeSubscriptions: createSubscriptions(),
    // Declared up front so relation and plain trait instances share one hidden class.
    relationTargets: undefined,
    identifier: traitCtx.isIdentifier
      ? { targets: [], owners: new Map(), positions: undefined, queries: new Map() }
      : undefined,
  };

  setTraitInstance(ctx.traitInstances, trait, data);
  ctx.traitsByBit[data.generationId][31 - Math.clz32(ctx.bitflag)] = data;
  ctx.traits.add(trait);

  if (traitCtx.relation) ctx.relations.push(traitCtx.relation);

  incrementWorldBitflag(ctx);

  if (isOrderedTrait(trait)) setupOrderedTraitSync(ctx, trait);

  if (ctx.traitRegisteredSubscriptions.size > 0) {
    for (const sub of ctx.traitRegisteredSubscriptions) sub(trait);
  }
}

export function addTrait(ctx: WorldContext, entity: Entity, ...traits: ConfigurableTrait[]) {
  ctx.structuralDepth++;
  try {
    if (assertsEnabled) {
      assertEntityAlive(ctx, entity);
    }
    addTraitsToAliveEntity(ctx, entity, traits);
  } catch (error) {
    ctx.structuralDepth--;
    throw error;
  }
  endStructuralChanges(ctx);
}

/** The caller must establish entity liveness before adding traits. */
export /* @inline */ function addTraitsToAliveEntity(
  ctx: WorldContext,
  entity: Entity,
  traits: ConfigurableTrait[]
) {
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];

    // Pairs are the only configs that are neither a trait nor a tuple.
    if (typeof config !== 'function' && !Array.isArray(config)) /* @cold */ {
      if (isRelationPair(config)) addRelationPair(ctx, entity, config);
      else addIdentifierPair(ctx, entity, config);
    } else {
      let trait: Trait;
      let params: Record<string, any> | undefined;

      if (Array.isArray(config)) {
        trait = config[0];
        params = config[1];
      } else {
        trait = config as Trait;
      }

      if (hasTrait(ctx, entity, trait)) continue;
      if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);

      // Initialize before membership. Accessors own rollback of their storage and auxiliary state.
      const instance = getTraitInstance(ctx.traitInstances, trait)!;
      trait[$internal].add(ctx, getEntityId(entity), instance.store, params);
      grantTraitMembership(ctx, entity, instance);
      emit(instance.addSubscriptions, entity);
      notifyTraitAdded(ctx, entity, instance);
    }
  }
}

/* @inline */ function addRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;

  if (assertsEnabled) {
    assertRelationTarget(ctx, target);
  }
  if (typeof target !== 'number') return;

  const params = pair.params;
  const relationCtx = relation[$internal];
  const relationTrait = relationCtx.trait;

  if (hasRelationToTarget(ctx, relation, entity, target)) return;

  if (relationCtx.exclusive) {
    const oldTarget = getFirstRelationTarget(ctx, relation, entity);
    if (oldTarget !== undefined && oldTarget !== target) {
      const instance = getTraitInstance(ctx.traitInstances, relationTrait);
      if (instance) emit(instance.removeSubscriptions, entity, oldTarget);
      removeRelationTarget(ctx, relation, entity, oldTarget);
    }
  }

  const added = addTraitToEntity(ctx, entity, relationTrait);

  const targetIndex = addRelationTarget(ctx, relation, entity, target);
  if (targetIndex === -1) return;

  const instance = added ?? getTraitInstance(ctx.traitInstances, relationTrait)!;
  initRelationData(ctx, entity, relation, instance, targetIndex, params);
  if (added === undefined && instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(ctx, entity, instance, 'add', instance.generationId, instance.bitflag);
  }
  emit(instance.addSubscriptions, entity, target);
  notifyTraitAdded(ctx, entity, instance, target);
}

export function removeTrait(
  ctx: WorldContext,
  entity: Entity,
  ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  ctx.structuralDepth++;
  try {
    if (assertsEnabled) {
      assertEntityAlive(ctx, entity);
    }

    for (let i = 0; i < traits.length; i++) {
      const trait = traits[i];

      if (typeof trait !== 'function') /* @cold */ {
        if (isRelationPair(trait)) {
          removeRelationPair(ctx, entity, trait);
        } else if (hasIdentifier(ctx, entity, trait)) {
          removeTraitFromAliveEntity(ctx, entity, trait.identifier[$internal].trait);
        }
      } else if (isIdentifier(trait)) /* @cold */ {
        removeTraitFromAliveEntity(ctx, entity, trait[$internal].trait);
      } else {
        removeTraitFromAliveEntity(ctx, entity, trait);
      }
    }
  } catch (error) {
    ctx.structuralDepth--;
    throw error;
  }
  endStructuralChanges(ctx);
}

/** The caller must establish entity liveness before removing a trait. */
export function removeTraitFromAliveEntity(ctx: WorldContext, entity: Entity, trait: Trait) {
  if (!hasTrait(ctx, entity, trait)) return;

  const traitCtx = trait[$internal];

  if (traitCtx.isIdentifier) {
    releaseIdentifierTrait(ctx, entity, getTraitInstance(ctx.traitInstances, trait)!);
    return;
  }

  if (traitCtx.relation) {
    releaseRelationTargets(ctx, entity, trait, traitCtx.relation);
  } else {
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance) {
      emit(instance.removeSubscriptions, entity);
      traitCtx.remove(ctx, getEntityId(entity), instance.store);
    }
  }

  removeTraitFromEntity(ctx, entity, trait);
}

/** Release the key before membership, then tell the queries and subscribers of that key. */
export function releaseIdentifierTrait(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const target = releaseIdentifier(entity, instance);
  removeTraitFromEntity(ctx, entity, instance.trait);
  reconcileKeyQueries(ctx, entity, instance, target);
  emit(instance.removeSubscriptions, entity, target);
}

/** Tell the pair subscribers and drop every target before a relation trait leaves an entity. */
export function releaseRelationTargets(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  relation: Relation<Trait>
) {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance) {
    const targets = getRelationTargets(ctx, relation, entity);
    for (const t of targets) emit(instance.removeSubscriptions, entity, t);
  }
  removeAllRelationTargets(ctx, relation, entity);
}

/**
 * A dying entity leaves its queries and tells its subscribers. Data and outgoing relation
 * targets stay readable until eviction. Reverse relation indexes let go of it immediately.
 */
export function removeTraitFromDyingEntity(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance
) {
  const traitCtx = instance.trait[$internal];
  // A key is free for another entity as soon as its owner dies.
  if (traitCtx.isIdentifier) {
    releaseIdentifierTrait(ctx, entity, instance);
    return;
  }

  const relation = traitCtx.relation;
  let targets: readonly Entity[] | undefined;
  if (relation) {
    targets = getRelationTargets(ctx, relation, entity);
    for (const t of targets) emit(instance.removeSubscriptions, entity, t);
    detachRelationTargets(instance, entity);
  } else {
    emit(instance.removeSubscriptions, entity);
    traitCtx.remove(ctx, getEntityId(entity), instance.store);
  }

  const { generationId, bitflag } = instance;
  const eid = getEntityId(entity);
  if (assertsEnabled) ctx.structuralRevision++;
  const page = ctx.entityMasks[generationId][eid >>> 10];
  const slot = (eid & 1023) << 2;
  page[slot] &= ~bitflag;
  page[slot + REMOVED_WORD] |= bitflag;
  instance.version++;

  // Most traits have no query to leave, so the check stays here and the work is a call.
  if (
    instance.queries.length !== 0 ||
    instance.trackingQueries.length !== 0 ||
    instance.anchorRelations.length !== 0 ||
    targets !== undefined
  ) {
    reconcileDyingTraitQueries(ctx, entity, instance, targets);
  }
}

/**
 * A dying entity only leaves static queries, since losing a forbidden trait must not let it enter
 * one. Tracking queries get the removal, and every pair the entity kept counts as removed.
 */
export function reconcileDyingTraitQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  targets: readonly Entity[] | undefined
) {
  leaveStaticQueries(ctx, entity, instance.queries);
  if (targets !== undefined) leaveStaticQueries(ctx, entity, instance.relationQueries);
  if (instance.anchorRelations.length !== 0) reconcileAnchoredQueries(ctx, entity, instance, true);
  if (instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(
      ctx,
      entity,
      instance,
      'remove',
      instance.generationId,
      instance.bitflag
    );
  }
  if (targets !== undefined && instance.relationQueries.length !== 0) {
    for (const t of targets) reconcileRelationQueries(ctx, instance, entity, t, 'remove', true);
  }
}

function leaveStaticQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  for (let i = 0; i < queries.length; i++) {
    if (!queries[i].isTracking) removeEntityFromQuery(ctx, queries[i], entity);
  }
}

/* @inline */ function removeRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;
  const relationTrait = relation[$internal].trait;

  if (!hasTrait(ctx, entity, relationTrait)) return;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);

  if (target === '*') {
    if (instance) {
      const targets = getRelationTargets(ctx, relation, entity);
      for (const t of targets) emit(instance.removeSubscriptions, entity, t);
    }
    removeAllRelationTargets(ctx, relation, entity);
    removeTraitFromEntity(ctx, entity, relationTrait);
    return;
  }

  if (typeof target === 'number') {
    if (instance) emit(instance.removeSubscriptions, entity, target);

    const remaining = removeRelationTarget(ctx, relation, entity, target);
    if (remaining === 0) removeTraitFromEntity(ctx, entity, relationTrait);
  }
}

export function cleanupRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): void {
  const relationTrait = relation[$internal].trait;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);
  if (instance) emit(instance.removeSubscriptions, entity, target);

  const remaining = removeRelationTarget(ctx, relation, entity, target);
  if (remaining === 0) removeTraitFromEntity(ctx, entity, relationTrait);
}

export /* @inline @pure */ function hasTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait
): boolean {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) return false;

  const { generationId, bitflag } = instance;
  const eid = getEntityId(entity);
  const mask = ctx.entityMasks[generationId][eid >>> 10][(eid & 1023) << 2];

  return (mask & bitflag) === bitflag;
}

/** Raw writes bypass accessors. Callers must preserve any trait-owned invariants. */
export /* @inline @pure */ function getStore<C extends Trait = Trait>(
  ctxOrWorld: WorldContext | World,
  trait: C
): ExtractStore<C> {
  const ctx =
    'traitInstances' in ctxOrWorld ? (ctxOrWorld as WorldContext) : (ctxOrWorld as World)[$internal];
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  return instance.store as ExtractStore<C>;
}

export /* @inline */ function setTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged: boolean
) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (isRelationPair(trait)) /* @cold */ {
    return setTraitForPair(ctx, entity, trait, value, triggerChanged);
  }
  return setTraitForTrait(ctx, entity, trait, value, triggerChanged);
}

export /* @inline */ function getTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  out?: Record<string, unknown>
) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  /* @cold */ if (isRelationPair(trait)) {
    return getTraitForPair(ctx, entity, trait, out);
  }
  return getTraitForTrait(ctx, entity, trait, out);
}

export /* @inline @pure */ function getTraitForPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  out: Record<string, unknown> | undefined
) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  if (typeof target !== 'number') return undefined;

  return getRelationData(ctx, entity, relation, target, out);
}

export /* @inline @pure */ function getTraitForTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  out: Record<string, unknown> | undefined
) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return undefined;
  const index = getEntityId(entity);
  if ((ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
    return undefined;
  const traitCtx = trait[$internal];
  return out === undefined
    ? traitCtx.get(ctx, index, data.store)
    : traitCtx.getInto(ctx, index, data.store, out);
}

export /* @inline */ function setTraitForPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  value: any,
  triggerChanged: boolean
) {
  if (assertsEnabled) {
    setTraitForPairWithAsserts(ctx, entity, pair, value, triggerChanged);
  } else {
    const relation = pair.relation as Relation<Trait>;
    const target = pair.target;
    if (typeof target !== 'number') return;
    if (typeof value === 'function') {
      value = value(getRelationData(ctx, entity, relation, target));
    }
    setRelationData(ctx, entity, relation, target, value);
    if (triggerChanged) setPairChanged(ctx, entity, relation[$internal].trait, target);
  }
}

export function setTraitForPairWithAsserts(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair,
  value: any,
  triggerChanged: boolean
) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  assertRelationTarget(ctx, target);
  let targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) {
    throw new Error(
      `Koota: [RELATION_PRESENT] Add the relation pair before setting it. Entity ${entity}, target ${target}, trait ${relation[$internal].trait.id}.`
    );
  }

  if (typeof value === 'function') {
    // An unchanged revision preserves the validated pair and its target index.
    const structuralRevision = ctx.structuralRevision;
    value = value(getRelationData(ctx, entity, relation, target));
    if (
      structuralRevision !== ctx.structuralRevision ||
      structuralRevision >= Number.MAX_SAFE_INTEGER
    ) {
      assertEntityAlive(ctx, entity);
      assertRelationTarget(ctx, target);
      targetIndex = getTargetIndex(ctx, relation, entity, target);
      if (targetIndex === -1) {
        throw new Error(
          `Koota: [RELATION_PRESENT] The relation pair was removed during its set callback. Entity ${entity}, target ${target}, trait ${relation[$internal].trait.id}.`
        );
      }
    }
  }

  setRelationDataAtIndex(ctx, entity, relation, targetIndex, value);
  if (triggerChanged) setPairChanged(ctx, entity, relation[$internal].trait, target);
}

export /* @inline */ function setTraitForTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  value: any,
  triggerChanged: boolean
) {
  const data = getTraitInstance(ctx.traitInstances, trait)!;
  const index = getEntityId(entity);

  if (
    assertsEnabled &&
    (data === undefined ||
      (ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
  ) {
    throw createTraitNotPresentError(entity, trait, true);
  }

  const traitCtx = trait[$internal];
  const store = data.store;

  if (typeof value === 'function') {
    value = resolveTraitSetCallback(ctx, entity, trait, value, data, index);
  }

  traitCtx.set(ctx, index, store, value);
  if (triggerChanged) {
    notifyTraitChanged(ctx, entity, data);
  } else data.version++;
}

/**
 * An unchanged revision preserves validated liveness and membership.
 * Keep callback work separate so ordinary value writes can inline.
 */
export function resolveTraitSetCallback(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  callback: (previous: any) => any,
  data: TraitInstance,
  index: number
) {
  const structuralRevision = assertsEnabled ? ctx.structuralRevision : 0;
  const value = callback(trait[$internal].get(ctx, index, data.store));
  if (
    assertsEnabled &&
    (structuralRevision !== ctx.structuralRevision || structuralRevision >= Number.MAX_SAFE_INTEGER)
  ) {
    assertEntityAlive(ctx, entity);
    // Trait removal retains the instance. Read membership again after the callback.
    if (
      (ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) ===
      0
    ) {
      throw createTraitNotPresentError(entity, trait);
    }
  }
  return value;
}

/* @inline */ function addTraitToEntity(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait
): TraitInstance | undefined {
  if (hasTrait(ctx, entity, trait)) return undefined;

  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  grantTraitMembership(ctx, entity, instance);
  return instance;
}

/** Flip the membership bit and reconcile every query that includes the trait. */
export /* @inline */ function grantTraitMembership(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance
) {
  const { generationId, bitflag } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  if (assertsEnabled) ctx.structuralRevision++;
  const generation = ctx.entityMasks[generationId];
  let page = generation[pageId];
  if (page === EMPTY_MASK_PAGE) page = materializeMaskPage(generation, pageId);
  page[(eid & 1023) << 2] |= bitflag;
  instance.version++;

  reconcileTraitQueries(ctx, entity, instance, 'add', generationId, bitflag);
}

/** Re-evaluate the queries that include a trait after its membership bit changed. */
export function reconcileTraitQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  eventType: EventType,
  generationId: number,
  bitflag: number
) {
  if (instance.queries.length !== 0) reconcileQueries(ctx, entity, instance.queries);
  if (instance.anchorRelations.length !== 0) reconcileAnchoredQueries(ctx, entity, instance, false);
  if (instance.trackingQueries.length !== 0) {
    reconcileTrackingQueries(ctx, entity, instance, eventType, generationId, bitflag);
  }
}

export function reconcileQueries(ctx: WorldContext, entity: Entity, queries: QueryInstance[]) {
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (query.filters !== null) {
      if (checkQueryWithFilters(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(ctx, query, entity);
    } else {
      if (checkQuery(ctx, query, entity)) addEntityToQuery(query, entity);
      else removeEntityFromQuery(ctx, query, entity);
    }
  }
}

export function reconcileTrackingQueries(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  eventType: EventType,
  generationId: number,
  bitflag: number
) {
  // The entity may now pass a static term that deferred its writes.
  if (ctx.defersChanges) clearPendingChanges(ctx, getEntityId(entity));
  const queries = instance.trackingQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const match = checkQueryTracking(ctx, query, entity, eventType, generationId, bitflag);
    if (match) addEntityToQuery(query, entity);
    else removeEntityFromQuery(ctx, query, entity);
  }
}

function removeTraitFromEntity(ctx: WorldContext, entity: Entity, trait: Trait): void {
  if (!hasTrait(ctx, entity, trait)) return;

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  const { generationId, bitflag } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  /* @cold */ if (assertsEnabled && trait[$internal].relation) {
    const targets = instance.relationTargets?.[pageId]?.[offset];
    if (typeof targets === 'number' || (targets !== undefined && targets.length > 0)) {
      throw new Error(
        `Koota: [RELATION_INDEX] Remove relation targets before removing their trait membership. Entity ${entity}, trait ${trait.id}.`
      );
    }
  }
  if (assertsEnabled) ctx.structuralRevision++;
  const page = ctx.entityMasks[generationId][pageId];
  const slot = offset << 2;
  page[slot] &= ~bitflag;
  page[slot + REMOVED_WORD] |= bitflag;
  instance.version++;

  reconcileTraitQueries(ctx, entity, instance, 'remove', generationId, bitflag);
}
