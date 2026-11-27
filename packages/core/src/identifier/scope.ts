import { assertsEnabled } from '../build-flags';
import { isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import type { Relation } from '../relation/types';
import { hasTraitMembership } from '../trait/membership';
import type { WorldContext } from '../world/types';
import {
  addSharedIdentifierOwner,
  getIdentifierOwners,
  lookupIdentifier,
  lookupScopedIdentifier,
  releaseIdentifierOwner,
  releaseIdentifierTrait,
} from './ownership';
import type { IdentifierPair } from './types';

/** Check every identifier before moving any of them or changing the relation. */
export function validateScopeMove(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
): boolean {
  const eid = getEntityId(entity);
  for (const identifier of relation[$internal].scopedIdentifiers!) {
    if (!identifier[$internal].exclusive) continue;
    const index = ctx.traitInstances[identifier.id]?.identifier;
    const key = index?.targets[eid >>> 10]?.[eid & 1023];
    if (key === undefined) continue;
    const owner = (target === undefined ? index!.owners : index!.scopes?.get(target))?.get(key);
    if (owner !== undefined && owner !== entity) {
      if (assertsEnabled) {
        throw new Error(
          `Koota: [IDENTIFIER_TAKEN] Identifier ${identifier.id} key ${JSON.stringify(key)} is taken in the destination scope.`
        );
      }
      return false;
    }
  }
  return true;
}

/** Reparenting changes lookup ownership without changing any local key or its query membership. */
export function moveScopedIdentifiers(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
) {
  const eid = getEntityId(entity);
  for (const identifier of relation[$internal].scopedIdentifiers!) {
    const data = ctx.traitInstances[identifier.id];
    const index = data?.identifier;
    const key = index?.targets[eid >>> 10]?.[eid & 1023];
    if (key === undefined) continue;
    releaseIdentifierOwner(index!, entity, key);
    index!.scopeTargets![eid >>> 10][eid & 1023] = target;
    const owners = getIdentifierOwners(index!, target);
    const previous = owners.get(key);
    if (previous === undefined) owners.set(key, entity);
    else addSharedIdentifierOwner(index!, entity, key, previous);
    data!.version++;
  }
}

/** A path starts at a root key or at an entity, which must be a live handle of this world. */
export /* @inline @pure */ function lookupScopeStart(
  ctx: WorldContext,
  start: IdentifierPair | Entity
): Entity | undefined {
  if (typeof start !== 'number') return lookupIdentifier(ctx, start);
  return isEntityAlive(ctx.entityIndex, start) ? start : undefined;
}

/** A scope and one key. Kept as a call so the lookup method stays small enough to inline. */
export function lookupScopedKey(
  ctx: WorldContext,
  start: IdentifierPair | Entity,
  key: IdentifierPair
): Entity | undefined {
  const scope = lookupScopeStart(ctx, start);
  return scope === undefined ? undefined : lookupScopedIdentifier(ctx, scope, key);
}

/** Each segment is a local lookup under the entity resolved by the preceding segment. */
export function lookupArgumentsScope(
  ctx: WorldContext,
  args: IArguments,
  length: number
): Entity | undefined {
  let scope = lookupScopeStart(ctx, args[0] as IdentifierPair | Entity);
  for (let i = 1; i < length && scope !== undefined; i++) {
    scope = lookupScopedIdentifier(ctx, scope, args[i] as IdentifierPair);
  }
  return scope;
}

/** A parent being destroyed releases any exclusive child keys already taken in the root scope. */
export function releaseConflictingRootKeys(ctx: WorldContext, relation: Relation, entity: Entity) {
  const eid = getEntityId(entity);
  for (const identifier of relation[$internal].scopedIdentifiers!) {
    if (!identifier[$internal].exclusive) continue;
    const instance = ctx.traitInstances[identifier.id];
    if (instance === undefined || instance.identifier === undefined) continue;
    const index = instance.identifier;
    const key = index.targets[eid >>> 10]?.[eid & 1023];
    if (key === undefined) continue;
    const owner = index.owners.get(key);
    if (owner !== undefined && owner !== entity && hasTraitMembership(ctx, entity, instance.trait)) {
      releaseIdentifierTrait(ctx, entity, instance);
    }
  }
}
