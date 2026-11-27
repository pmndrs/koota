import { assertsEnabled } from '../build-flags';
import { beginRootDefer, deferCommand, endRootDefer, runCommand } from '../command/buffer';
import { assertAliveOrWorldDestroyed, assertEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { isIdentifier, isIdentifierPair } from '../identifier/identifier';
import {
  addIdentifierPair,
  getIdentifierTarget,
  hasIdentifier,
  releaseIdentifierTrait,
} from '../identifier/ownership';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { $internal } from '../internal';
import { addMachineTrait, removeMachineTrait } from '../machine/transitions';
import { createQuery, isQuery } from '../query/query';
import { ensureQueryInstance } from '../query/registry';
import {
  addRelationPair,
  getRelationPairRecord,
  releaseRelationTargets,
  removeRelationPair,
  setRelationPairRecord,
} from '../relation/pairs';
import { isRelationPair } from '../relation/relation';
import {
  getFirstRelationTarget,
  getRelationTargets,
  hasRelationPair,
  hasRelationTargetInSet,
  hasRelationToTarget,
} from '../relation/targets';
import type { Relation, RelationPair } from '../relation/types';
import type { WorldContext } from '../world/types';
import { emit, notifyChanged, notifyTraitAdded, notifyTraitChanged } from './hooks';
import {
  assertTraitMembership,
  createTraitMembershipError,
  grantTraitMembership,
  hasTraitMembership,
  revokeTraitMembership,
} from './membership';
import { getTraitInstance, registerTrait } from './registry';
import type { ConfigurableTrait, Trait, TraitInstance } from './types';

export /* @inline */ function addTrait(
  ctx: WorldContext,
  entity: Entity,
  traits: ConfigurableTrait[]
) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }
  if (ctx.deferDepth !== 0) {
    // One trait is logged as it is. More are spread again instead of handing over the rest array,
    // which would make every immediate add allocate it once this branch has run.
    if (traits.length === 1) deferAddOneTrait(ctx, entity, traits[0]);
    else deferAddTrait(ctx, entity, ...traits);
  } else {
    beginRootDefer(ctx);
    try {
      applyAddTrait(ctx, entity, traits);
    } finally {
      endRootDefer(ctx);
    }
  }
}

/** Logs the add of one trait, the common case, with no argument array. */
export function deferAddOneTrait(ctx: WorldContext, entity: Entity, config: ConfigurableTrait) {
  deferCommand(ctx, applyAddOneTrait, entity, config, undefined);
}

/** Logs the add of several traits. The rest parameter is the array the command keeps. */
export function deferAddTrait(ctx: WorldContext, entity: Entity, ...traits: ConfigurableTrait[]) {
  deferCommand(ctx, applyAddTrait, entity, traits, undefined);
}

/** The add of one trait as a command, the common case, which keeps argument arrays out of the log. */
function applyAddOneTrait(ctx: WorldContext, entity: Entity, config: ConfigurableTrait) {
  applyAddTrait(ctx, entity, [config]);
}

/** Adds traits to a live entity inside the caller's defer scope. */
export /* @inline */ function applyAddTrait(
  ctx: WorldContext,
  entity: Entity,
  traits: ConfigurableTrait[]
) {
  const eid = getEntityId(entity);
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    let trait: Trait;
    let params: Record<string, any> | undefined;
    if (typeof config === 'function') {
      trait = config as Trait;
    } else if (Array.isArray(config)) {
      trait = config[0];
      params = config[1];
    } else {
      addPair(ctx, entity, config, traits, i);
      continue;
    }

    // One instance load serves the membership check, registration and the add.
    let instance = getTraitInstance(ctx.traitInstances, trait);
    if (
      instance !== undefined &&
      (instance.masks[eid >>> 10][(eid & 1023) << 2] & instance.bitflag) !== 0
    )
      continue;
    if (trait[$internal].kind === 'machine') /* @cold */ {
      addMachineTrait(ctx, entity, trait, params, traits);
    } else {
      if (instance === undefined) instance = registerTrait(ctx, trait);
      // Initialize before membership. Accessors own rollback of their storage and auxiliary state.
      trait[$internal].add(ctx, eid, instance.store, params);
      grantTraitMembership(ctx, entity, instance);
      notifyTraitAdded(entity, instance);
    }
  }
}

/** Pairs are the only configs that are neither a trait nor a tuple. Kept out of line as the rare case. */
export function addPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair | IdentifierPair,
  traits: ConfigurableTrait[],
  offset: number
) {
  if (isRelationPair(pair)) addRelationPair(ctx, entity, pair);
  else if (pair.identifier[$internal].scope !== undefined) {
    addScopedIdentifierPair(ctx, entity, pair, traits, offset);
  } else addIdentifierPair(ctx, entity, pair);
}

/**
 * Apply a following parent pair before a name can claim a temporary root key. The name then
 * resolves in whatever scope the entity holds, even when the parent pair was skipped.
 */
function addScopedIdentifierPair(
  ctx: WorldContext,
  entity: Entity,
  pair: IdentifierPair,
  traits: ConfigurableTrait[],
  offset: number
) {
  const scope = pair.identifier[$internal].scope!;
  for (let i = offset + 1; i < traits.length; i++) {
    const next = traits[i];
    if (isRelationPair(next) && next.relation === scope) {
      addRelationPair(ctx, entity, next);
      break;
    }
  }
  addIdentifierPair(ctx, entity, pair);
}

/** Set the value where the trait or pair is present and add it with the value where it is absent. */
export /* @inline */ function upsertTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any
) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (ctx.deferDepth === 0 && typeof trait === 'function' && hasTraitMembership(ctx, entity, trait)) {
    // Upsert takes no callback, so the value is written as given.
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    trait[$internal].set(ctx, getEntityId(entity), instance.store, value);
    notifyTraitChanged(ctx, entity, instance);
  } else /* @cold */ {
    // Pairs and additions run out of line so the present trait write stays small enough to inline.
    // Inside a scope the whole upsert waits, since whether the trait is present is decided then.
    runCommand(ctx, applyUpsertTrait, entity, trait, value);
  }
}

/** The upsert as a command. Presence is checked when it applies, so the last upsert wins. */
export function applyUpsertTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any
) {
  if (typeof trait === 'function') {
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance !== undefined && hasTraitMembership(ctx, entity, trait)) {
      trait[$internal].set(ctx, getEntityId(entity), instance.store, value);
      notifyTraitChanged(ctx, entity, instance);
    } else {
      applyAddTrait(ctx, entity, [[trait, value]]);
    }
  } else if (
    typeof trait.target === 'number' &&
    hasRelationToTarget(ctx, trait.relation, entity, trait.target)
  ) {
    setRelationPairRecord(ctx, entity, trait, value, true);
  } else {
    // The relation call validates the target and builds the pair that carries the value.
    addRelationPair(ctx, entity, trait.relation(trait.target!, value));
  }
}

export function removeTrait(
  ctx: WorldContext,
  entity: Entity,
  ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  if (assertsEnabled) {
    assertAliveOrWorldDestroyed(ctx, entity);
  }
  if (ctx.deferDepth !== 0) {
    // Spread again so the command gets an array of its own and the rest array never escapes. A
    // single trait path like the one in addTrait does not fit the inline budget of this function.
    deferRemoveTrait(ctx, entity, ...traits);
  } else {
    beginRootDefer(ctx);
    try {
      applyRemoveTrait(ctx, entity, traits);
    } finally {
      endRootDefer(ctx);
    }
  }
}

/** Logs the removal. The rest parameter is the array the command keeps. */
function deferRemoveTrait(
  ctx: WorldContext,
  entity: Entity,
  ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  deferCommand(ctx, applyRemoveTrait, entity, traits, undefined);
}

/** Removes traits from a live entity inside the caller's defer scope. */
/* @inline */ function applyRemoveTrait(
  ctx: WorldContext,
  entity: Entity,
  traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];

    if (typeof trait !== 'function') /* @cold */ {
      if (isRelationPair(trait)) {
        removeRelationPair(ctx, entity, trait);
      } else if (hasIdentifier(ctx, entity, trait)) {
        removeOneTrait(ctx, entity, trait.identifier[$internal].trait);
      }
    } else if (isIdentifier(trait)) /* @cold */ {
      removeOneTrait(ctx, entity, trait[$internal].trait);
    } else {
      removeOneTrait(ctx, entity, trait);
    }
  }
}

/** The caller must establish entity liveness before removing a trait. */
export function removeOneTrait(ctx: WorldContext, entity: Entity, trait: Trait) {
  // One instance load serves the membership check and the removal.
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance === undefined) return;
  const eid = getEntityId(entity);
  const mask = instance.masks[eid >>> 10][(eid & 1023) << 2];
  if ((mask & instance.bitflag) === 0) return;

  const traitCtx = trait[$internal];
  if (traitCtx.kind !== 'trait') /* @cold */ {
    if (traitCtx.kind === 'machine') {
      removeMachineTrait(ctx, entity, trait);
    } else if (traitCtx.kind === 'identifier') {
      releaseIdentifierTrait(ctx, entity, instance);
    } else {
      releaseRelationTargets(ctx, entity, trait, traitCtx.relation!);
    }
    return;
  }
  emit(instance.removeSubscriptions, entity);
  traitCtx.remove(ctx, eid, instance.store);
  revokeTraitMembership(ctx, entity, trait);
}

export /* @inline */ function setTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged: boolean
) {
  /* @cold */ if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (isRelationPair(trait)) /* @cold */ {
    return setRelationPairRecord(ctx, entity, trait, value, triggerChanged);
  }
  return setTraitRecord(ctx, entity, trait, value, triggerChanged);
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
    return getRelationPairRecord(ctx, entity, trait, out);
  }
  return getTraitRecord(ctx, entity, trait, out);
}

export /* @inline */ function getTraitRecord(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  out: Record<string, unknown> | undefined
) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return undefined;
  const index = getEntityId(entity);
  if ((data.masks[index >>> 10][(index & 1023) << 2] & data.bitflag) === 0) return undefined;
  const traitCtx = trait[$internal];
  return out === undefined
    ? traitCtx.get(ctx, index, data.store)
    : traitCtx.getInto(ctx, index, data.store, out);
}

export /* @inline */ function setTraitRecord(
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
    (data === undefined || (data.masks[index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
  ) {
    throw createTraitMembershipError(entity, trait, true);
  }

  const traitCtx = trait[$internal];
  const store = data.store;

  if (typeof value === 'function') {
    value = resolveSetTraitCallback(ctx, entity, trait, value, data, index);
  }

  traitCtx.set(ctx, index, store, value);
  if (triggerChanged) {
    notifyTraitChanged(ctx, entity, data);
  } else data.version++;
}

/**
 * The callback holds no defer scope, so a structural change it makes applies before the write.
 * Assertions validate the entity and its membership again. Keep callback work separate so
 * ordinary value writes can inline.
 */
export function resolveSetTraitCallback(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait,
  callback: (previous: any) => any,
  data: TraitInstance,
  index: number
) {
  const value = callback(trait[$internal].get(ctx, index, data.store));
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
    // Trait removal retains the instance, so membership is read from the mask.
    if ((data.masks[index >>> 10][(index & 1023) << 2] & data.bitflag) === 0) {
      throw new Error(
        `Koota: [TRAIT_PRESENT] The trait was removed during its set callback. Wrap the set in world.defer to apply the removal after the write. Entity ${entity}, trait ${trait.id}.`
      );
    }
  }
  return value;
}

/** Publishes a change to a trait whose value was written in place, outside set. */
export function setTraitChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
    assertTraitMembership(ctx, entity, trait);
  }
  notifyChanged(ctx, entity, trait);
}

export /* @inline */ function hasTrait(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair | Identifier | IdentifierPair
): boolean {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (typeof trait !== 'function') /* @cold */ {
    if (isIdentifierPair(trait)) return hasIdentifier(ctx, entity, trait);
    return hasEntityRelationPair(ctx, entity, trait);
  }
  // An identifier shares the id of its backing trait, so presence reads it directly.
  return hasTraitMembership(ctx, entity, trait as Trait);
}

/** The key an identifier gives the entity, or the first target of a relation. */
export /* @inline */ function getTraitTarget(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<any> | Identifier
) {
  if (isIdentifier(relation)) return getIdentifierTarget(ctx, entity, relation);
  return getFirstRelationTarget(ctx, relation, entity);
}

/** Every target of a relation, or the one key of an identifier as a list. */
export /* @inline */ function getTraitTargets(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<any> | Identifier
) {
  if (isIdentifier(relation)) {
    const target = getIdentifierTarget(ctx, entity, relation);
    return target === undefined ? [] : [target];
  }
  return getRelationTargets(ctx, relation, entity);
}

/**
 * Relation pairs including target queries. Kept out of line so the plain trait path
 * stays small, and kept thin so the optimizer can still inline the whole check.
 */
export function hasEntityRelationPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair
): boolean {
  /* @cold */ if (pair.targetQuery) {
    if (!hasTraitMembership(ctx, entity, pair.relation[$internal].trait)) return false;
    const filter = pair.targetQuery;
    const targetQuery = isQuery(filter) ? filter : createQuery(...filter);
    // The entity's own targets are checked against the filter's members, so the cost follows
    // the targets of one entity and not every match of the filter.
    return hasRelationTargetInSet(
      ctx,
      pair.relation,
      entity,
      ensureQueryInstance(ctx, targetQuery).entities
    );
  }
  return hasRelationPair(ctx, entity, pair);
}
