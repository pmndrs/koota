import { assertsEnabled } from '../build-flags';
import { assertEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { reconcileKeyQueries, refreshTrackingQueries } from '../query/reconciliation';
import { markTraitChanged } from '../query/tracking';
import { getExclusiveTarget } from '../relation/targets';
import { emit, emitSubscribers, hasSubscribers } from '../trait/hooks';
import { grantTraitMembership, revokeTraitMembership } from '../trait/membership';
import { getTraitInstance, registerTrait } from '../trait/registry';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type { Identifier, IdentifierIndex, IdentifierKey, IdentifierPair } from './types';

export /* @inline @pure */ function lookupIdentifier(
  ctx: WorldContext,
  pair: IdentifierPair
): Entity | undefined {
  const owners = getRootIdentifierOwners(ctx, pair);
  return typeof owners === 'number' ? owners : owners?.[0];
}

export /* @inline @pure */ function lookupScopedIdentifier(
  ctx: WorldContext,
  scope: Entity,
  pair: IdentifierPair
): Entity | undefined {
  const eid = getEntityId(scope);
  const owners = ctx.traitInstances[pair.identifier.id]?.identifier?.scopeOwners?.[eid >>> 10]?.[
    eid & 1023
  ]?.get(pair.target);
  return typeof owners === 'number' ? owners : owners?.[0];
}

export function lookupAllIdentifiers(
  ctx: WorldContext,
  pair: IdentifierPair,
  scope: Entity | undefined
): Entity[] {
  const index = ctx.traitInstances[pair.identifier.id]?.identifier;
  const scopeId = scope === undefined ? 0 : getEntityId(scope);
  const owners = (
    scope === undefined ? index?.owners : index?.scopeOwners?.[scopeId >>> 10]?.[scopeId & 1023]
  )?.get(pair.target);
  return typeof owners === 'number' ? [owners] : owners === undefined ? [] : owners.slice();
}

/** Queries match local keys in every scope while lookup resolves a particular scope. */
export function lookupAllIdentifierScopes(ctx: WorldContext, pair: IdentifierPair): Entity[] {
  const result = lookupAllIdentifiers(ctx, pair, undefined);
  const scopes = ctx.traitInstances[pair.identifier.id]?.identifier?.scopes;
  if (scopes !== undefined) {
    for (const owners of scopes.values()) {
      const match = owners.get(pair.target);
      if (typeof match === 'number') result.push(match);
      else if (match !== undefined) for (const entity of match) result.push(entity);
    }
  }
  return result;
}

export /* @inline @pure */ function hasIdentifier(
  ctx: WorldContext,
  entity: Entity,
  pair: IdentifierPair
): boolean {
  const index = ctx.traitInstances[pair.identifier.id]?.identifier;
  const eid = getEntityId(entity);
  return index?.targets[eid >>> 10]?.[eid & 1023] === pair.target;
}

export /* @inline */ function getIdentifierTarget<K extends IdentifierKey>(
  ctx: WorldContext,
  entity: Entity,
  identifier: Identifier<K>
): K | undefined {
  if (assertsEnabled) assertEntityAlive(ctx, entity);
  const eid = getEntityId(entity);
  return ctx.traitInstances[identifier.id]?.identifier?.targets[eid >>> 10]?.[eid & 1023] as
    K | undefined;
}

/** Validate ownership before committing both directions, then notify the core. */
export function addIdentifierPair(ctx: WorldContext, entity: Entity, pair: IdentifierPair) {
  const trait = pair.identifier[$internal].trait;
  let data = getTraitInstance(ctx.traitInstances, trait);
  if (!data) {
    registerTrait(ctx, trait);
    data = getTraitInstance(ctx.traitInstances, trait);
  }
  if (!data) return;
  const index = data.identifier!;
  const eid = getEntityId(entity);
  const page = (index.targets[eid >>> 10] ??= []);
  const previous = page[eid & 1023];
  if (previous === pair.target) return;
  const scopeRelation = pair.identifier[$internal].scope;
  const scope =
    scopeRelation === undefined ? undefined : getExclusiveTarget(ctx, scopeRelation, entity);
  const ownerMap = getIdentifierOwners(index, scope);
  const owners = ownerMap.get(pair.target);
  if (typeof owners === 'number' && pair.identifier[$internal].exclusive) {
    if (assertsEnabled) {
      throw new Error(
        `Koota: [IDENTIFIER_TAKEN] Identifier ${trait.id} key ${JSON.stringify(pair.target)} belongs to entity ${owners}.`
      );
    }
    return;
  }

  if (previous !== undefined) releaseReplacedIdentifier(index, entity, previous, scope, ownerMap);
  if (index.scopeTargets !== undefined) (index.scopeTargets[eid >>> 10] ??= [])[eid & 1023] = scope;
  if (owners === undefined) {
    ownerMap.set(pair.target, entity);
  } else {
    addSharedIdentifierOwner(index, entity, pair.target, owners);
  }
  page[eid & 1023] = pair.target;

  notifyIdentifierAssignment(ctx, entity, data, pair, previous);
}

/** Replacing a key is rare. Releasing the last old key may have removed this scope's bucket. */
function releaseReplacedIdentifier(
  index: IdentifierIndex,
  entity: Entity,
  previous: IdentifierKey,
  scope: Entity | undefined,
  ownerMap: Map<IdentifierKey, Entity | Entity[]>
) {
  releaseIdentifierOwner(index, entity, previous);
  if (scope !== undefined) {
    index.scopes!.set(scope, ownerMap);
    const scopeId = getEntityId(scope);
    (index.scopeOwners![scopeId >>> 10] ??= [])[scopeId & 1023] = ownerMap;
  }
}

/** Shared owners use one paged offset per entity for membership and swap removal. */
export function addSharedIdentifierOwner(
  index: IdentifierIndex,
  entity: Entity,
  target: IdentifierKey,
  owners: Entity | Entity[]
) {
  const positions = (index.positions ??= []);
  const eid = getEntityId(entity);
  const page = (positions[eid >>> 10] ??= []);
  if (typeof owners === 'number') {
    const previousId = getEntityId(owners);
    (positions[previousId >>> 10] ??= [])[previousId & 1023] = 0;
    page[eid & 1023] = 1;
    const scope = index.scopeTargets?.[eid >>> 10]?.[eid & 1023];
    getIdentifierOwners(index, scope).set(target, [owners, entity]);
  } else {
    page[eid & 1023] = owners.length;
    owners.push(entity);
  }
}

/** Publish the committed mapping to queries and subscribers. */
function notifyIdentifierAssignment(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  pair: IdentifierPair,
  previous: IdentifierKey | undefined
) {
  if (previous === undefined) {
    grantTraitMembership(ctx, entity, data);
  } else {
    data.version++;
  }
  if (data.identifier!.queries.size !== 0) {
    if (previous !== undefined) reconcileKeyQueries(ctx, entity, data, previous);
    reconcileKeyQueries(ctx, entity, data, pair.target);
  }
  if (previous !== undefined) {
    if (data.trackingQueries.length !== 0) refreshTrackingQueries(ctx, entity, data);
    emit(data.removeSubscriptions, entity, previous);
  }
  // Subscribers run inside the defer scope of the add, so the assignment holds through all of them.
  if (hasSubscribers(data.addSubscriptions)) {
    emitSubscribers(data.addSubscriptions, entity, pair.target);
  }
  // Membership already recorded a first assignment for Changed queries. A replacement is a write.
  if (previous !== undefined) markTraitChanged(ctx, entity, data);
  if (hasSubscribers(data.changeSubscriptions)) {
    emitSubscribers(data.changeSubscriptions, entity, pair.target);
  }
}

/** Release the mapping before membership and callbacks observe its removal. */
function releaseIdentifier(entity: Entity, data: TraitInstance): IdentifierKey {
  const eid = getEntityId(entity);
  const index = data.identifier!;
  const page = index.targets[eid >>> 10];
  const target = page[eid & 1023]!;
  releaseIdentifierOwner(index, entity, target);
  page[eid & 1023] = undefined;
  if (index.scopeTargets !== undefined) index.scopeTargets[eid >>> 10][eid & 1023] = undefined;
  return target;
}

export /* @inline */ function releaseIdentifierOwner(
  index: IdentifierIndex,
  entity: Entity,
  target: IdentifierKey
) {
  const eid = getEntityId(entity);
  const scope = index.scopeTargets?.[eid >>> 10]?.[eid & 1023];
  const ownerMap = scope === undefined ? index.owners : index.scopes!.get(scope)!;
  const owners = ownerMap.get(target);
  if (typeof owners === 'object') {
    const eid = getEntityId(entity);
    const position = index.positions![eid >>> 10][eid & 1023];
    const last = owners.pop()!;
    if (position < owners.length) {
      owners[position] = last;
      const lastId = getEntityId(last);
      index.positions![lastId >>> 10][lastId & 1023] = position;
    }
    if (owners.length !== 0) return;
  }
  ownerMap.delete(target);
  if (scope !== undefined && ownerMap.size === 0) {
    index.scopes!.delete(scope);
    const scopeId = getEntityId(scope);
    const page = index.scopeOwners![scopeId >>> 10];
    if (page[scopeId & 1023] === ownerMap) page[scopeId & 1023] = undefined;
  }
}

/** The root key's stored owner or shared list. The caller may inspect it until the next mutation. */
export /* @inline @pure */ function getRootIdentifierOwners(ctx: WorldContext, pair: IdentifierPair) {
  return ctx.traitInstances[pair.identifier.id]?.identifier?.owners.get(pair.target);
}

/** Root ownership uses the same map as an unscoped identifier. */
export function getIdentifierOwners(
  index: IdentifierIndex,
  scope: Entity | undefined
): Map<IdentifierKey, Entity | Entity[]> {
  if (scope === undefined) return index.owners;
  let owners = index.scopes!.get(scope);
  if (owners === undefined) {
    index.scopes!.set(scope, (owners = new Map()));
    const eid = getEntityId(scope);
    (index.scopeOwners![eid >>> 10] ??= [])[eid & 1023] = owners;
  }
  return owners;
}

/** Release the key before membership, then tell the queries and subscribers of that key. */
export function releaseIdentifierTrait(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const target = releaseIdentifier(entity, instance);
  revokeTraitMembership(ctx, entity, instance.trait);
  reconcileKeyQueries(ctx, entity, instance, target);
  emit(instance.removeSubscriptions, entity, target);
}
