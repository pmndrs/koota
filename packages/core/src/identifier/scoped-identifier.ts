import { $internal } from '../common';
import { isEntityDestroying } from '../entity/entity';
import { assertsEnabled } from '../assert-config';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/utils/entity-index';
import { getEntityId } from '../entity/utils/pack-entity';
import type { Relation } from '../relation/types';
import type { WorldContext } from '../world/types';
import {
  addSharedIdentifierOwner,
  lookupIdentifier,
  lookupScopedIdentifier,
  releaseIdentifierOwner,
} from './identifier';
import type { IdentifierIndex, IdentifierKey, IdentifierPair } from './types';

export /* @inline @pure */ function getScopeTarget(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity
): Entity | undefined {
  const eid = getEntityId(entity);
  return ctx.traitInstances[relation[$internal].trait.id]?.relationTargets?.[eid >>> 10]?.[
    eid & 1023
  ] as Entity | undefined;
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

/** Check every identifier before moving any of them or changing the relation. */
export function validateScopeMove(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
): boolean {
  // The relation add already asserted the target. A dying scope would only leak its bucket.
  if (
    target !== undefined &&
    (!isEntityAlive(ctx.entityIndex, target) || isEntityDestroying(target))
  ) {
    return false;
  }
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
  return ctx.isRegistered && isEntityAlive(ctx.entityIndex, start) ? start : undefined;
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
