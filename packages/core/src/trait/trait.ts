import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive, assertRelationTarget, createTraitNotPresentError } from '../asserts';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { notifyTraitChanged, setPairChanged } from '../query/modifiers/changed';
import { checkQueryTrackingWithRelations } from '../query/utils/check-query-tracking-with-relations';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { isOrderedTrait, setupOrderedTraitSync } from '../relation/ordered';
import {
  addRelationTarget,
  getFirstRelationTarget,
  getRelationData,
  getRelationTargets,
  getTargetIndex,
  hasRelationPair,
  hasRelationToTarget,
  removeAllRelationTargets,
  removeRelationTarget,
  setRelationData,
  setRelationDataAtIndex,
} from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { ensureMaskPage } from '../entity/utils/paged-mask';
import {
  createAddFunction,
  createGetFunction,
  createSetFunction,
  createStore,
  getSchemaDefaults,
  Norm,
  Schema,
  StoreType,
  validateSchema,
} from '../storage';
import type { World, WorldContext } from '../world';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { createSubscriptions, emit } from './subscriptions';
import { getTraitInstance, hasTraitInstance, setTraitInstance } from './trait-instance';
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
    remove: () => {},
  };
  const accessors = customize?.(defaults);

  return {
    id: traitId++,
    createStore: () => createStore(schema),
    add: accessors?.add ?? defaults.add,
    set: accessors?.set ?? defaults.set,
    get: accessors?.get ?? defaults.get,
    remove: accessors?.remove ?? defaults.remove,
    relation: null,
    type,
  };
}

/** Define the public id and schema as read-only properties on a trait object. */
export function defineTraitProperties(target: object, id: number, schema: Schema) {
  Object.defineProperty(target, 'id', {
    value: id,
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
}

function createTrait(schema?: undefined | Record<string, never>): TagTrait;
function createTrait<S extends Schema>(schema: S): Trait<Norm<S>>;
function createTrait<S extends Schema>(schema: S = tagSchema as S): Trait<Norm<S>> {
  const context = createTraitContext(schema);
  const Trait = Object.assign(
    (params: TraitValue<Norm<S>>): [Trait<Norm<S>>, TraitValue<Norm<S>>] => [Trait, params],
    { [$internal]: context }
  ) as Trait<Norm<S>>;

  defineTraitProperties(Trait, context.id, schema);

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
    queries: new Set(),
    trackingQueries: new Set(),
    notQueries: new Set(),
    relationQueries: new Set(),
    schema: trait.schema,
    changeSubscriptions: createSubscriptions(),
    addSubscriptions: createSubscriptions(),
    removeSubscriptions: createSubscriptions(),
  };

  setTraitInstance(ctx.traitInstances, trait, data);
  ctx.traits.add(trait);

  if (traitCtx.relation) ctx.relations.add(traitCtx.relation);

  incrementWorldBitflag(ctx);

  if (isOrderedTrait(trait)) setupOrderedTraitSync(ctx, trait);

  if (ctx.traitRegisteredSubscriptions.size > 0) {
    for (const sub of ctx.traitRegisteredSubscriptions) sub(trait);
  }
}

export function addTrait(ctx: WorldContext, entity: Entity, ...traits: ConfigurableTrait[]) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }
  addTraitsToAliveEntity(ctx, entity, traits);
}

/** The caller must establish entity liveness before adding traits. */
export /* @inline */ function addTraitsToAliveEntity(
  ctx: WorldContext,
  entity: Entity,
  traits: ConfigurableTrait[]
) {
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];

    if (isRelationPair(config)) {
      addRelationPair(ctx, entity, config);
      continue;
    }

    let trait: Trait;
    let params: Record<string, any> | undefined;

    if (Array.isArray(config)) {
      [trait, params] = config as [Trait, Record<string, any>];
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

  let instance = addTraitToEntity(ctx, entity, relationTrait);

  const targetIndex = addRelationTarget(ctx, relation, entity, target);
  if (targetIndex === -1) return;

  const schema = instance?.schema ?? getTraitInstance(ctx.traitInstances, relationTrait)!.schema;
  const defaults = getSchemaDefaults(schema, relationTrait[$internal].type);

  if (defaults) {
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, { ...defaults, ...params });
  } else if (params) {
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, params);
  }

  instance = instance ?? getTraitInstance(ctx.traitInstances, relationTrait)!;
  emit(instance.addSubscriptions, entity, target);
}

export function removeTrait(ctx: WorldContext, entity: Entity, ...traits: (Trait | RelationPair)[]) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];

    if (isRelationPair(trait)) {
      removeRelationPair(ctx, entity, trait);
      continue;
    }

    if (!hasTrait(ctx, entity, trait)) continue;

    const traitCtx = trait[$internal];

    if (traitCtx.relation) {
      const instance = getTraitInstance(ctx.traitInstances, trait);
      if (instance) {
        const targets = getRelationTargets(ctx, traitCtx.relation, entity);
        for (const t of targets) emit(instance.removeSubscriptions, entity, t);
      }
      removeAllRelationTargets(ctx, traitCtx.relation, entity);
    } else {
      const instance = getTraitInstance(ctx.traitInstances, trait);
      if (instance) {
        emit(instance.removeSubscriptions, entity);
        traitCtx.remove(ctx, getEntityId(entity), instance.store);
      }
    }

    removeTraitFromEntity(ctx, entity, trait);
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

    const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
    if (removedIndex === -1) return;

    if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
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

  const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
  if (removedIndex === -1) return;

  if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
}

export function hasTrait(ctx: WorldContext, entity: Entity, trait: Trait): boolean {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) return false;

  const { generationId, bitflag } = instance;
  const eid = getEntityId(entity);
  const mask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];

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

export function setTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged = true
) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (isRelationPair(trait)) return setTraitForPair(ctx, entity, trait, value, triggerChanged);
  return setTraitForTrait(ctx, entity, trait, value, triggerChanged);
}

export function getTrait(ctx: WorldContext, entity: Entity, trait: Trait | RelationPair) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (isRelationPair(trait)) return getTraitForPair(ctx, entity, trait);
  return getTraitForTrait(ctx, entity, trait);
}

/* @inline @pure */ function getTraitForPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  if (!hasRelationPair(ctx, entity, pair)) return undefined;
  if (typeof target !== 'number') return undefined;

  return getRelationData(ctx, entity, relation, target);
}

/* @inline @pure */ function getTraitForTrait(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  const index = getEntityId(entity);
  if (
    data === undefined ||
    (ctx.entityMasks[data.generationId][index >>> 10][index & 1023] & data.bitflag) === 0
  )
    return undefined;
  return trait[$internal].get(ctx, index, data.store);
}

/* @inline */ function setTraitForPair(
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

function setTraitForPairWithAsserts(
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

/* @inline */ function setTraitForTrait(
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
      (ctx.entityMasks[data.generationId][index >>> 10][index & 1023] & data.bitflag) === 0)
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
function resolveTraitSetCallback(
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
    if ((ctx.entityMasks[data.generationId][index >>> 10][index & 1023] & data.bitflag) === 0) {
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
/* @inline */ function grantTraitMembership(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance
) {
  const { generationId, bitflag, queries, trackingQueries } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  if (assertsEnabled) ctx.structuralRevision++;
  ensureMaskPage(ctx.entityMasks[generationId], pageId)[offset] |= bitflag;
  instance.version++;

  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of queries) {
    query.toRemove.remove(entity);
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of trackingQueries) {
    query.toRemove.remove(entity);
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'add', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'add', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  ctx.entityTraits.get(entity)!.add(instance.trait);
}

function removeTraitFromEntity(ctx: WorldContext, entity: Entity, trait: Trait): void {
  if (!hasTrait(ctx, entity, trait)) return;

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  const { generationId, bitflag, queries, trackingQueries } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  if (assertsEnabled && trait[$internal].relation) {
    const targets = instance.relationTargets?.[pageId]?.[offset];
    if (typeof targets === 'number' || (targets !== undefined && targets.length > 0)) {
      throw new Error(
        `Koota: [RELATION_INDEX] Remove relation targets before removing their trait membership. Entity ${entity}, trait ${trait.id}.`
      );
    }
  }
  if (assertsEnabled) ctx.structuralRevision++;
  ctx.entityMasks[generationId][pageId][offset] &= ~bitflag;
  instance.version++;

  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of queries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of trackingQueries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'remove', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'remove', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  ctx.entityTraits.get(entity)!.delete(trait);
}
