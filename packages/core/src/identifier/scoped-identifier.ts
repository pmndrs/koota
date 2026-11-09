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

/** Detect both a new cycle through the source and cycles predating the identifier definition. */
export function validateScopeParent(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
): boolean {
  if (
    target !== undefined &&
    (!isEntityAlive(ctx.entityIndex, target) || isEntityDestroying(target))
  ) {
    if (assertsEnabled)
      throw new Error('Koota: [IDENTIFIER_SCOPE] Scope must be alive in this world.');
    return false;
  }
  let slow = target;
  let fast = target;
  while (fast !== undefined) {
    if (fast === entity) return refuseScopeCycle();
    fast = getScopeTarget(ctx, relation, fast);
    if (fast === undefined) break;
    if (fast === entity) return refuseScopeCycle();
    fast = getScopeTarget(ctx, relation, fast);
    slow = getScopeTarget(ctx, relation, slow!);
    if (fast !== undefined && fast === slow) return refuseScopeCycle();
  }
  return true;
}

function refuseScopeCycle(): false {
  if (assertsEnabled)
    throw new Error('Koota: [IDENTIFIER_SCOPE_CYCLE] Scope hierarchy cannot contain cycles.');
  return false;
}

/** Check every identifier before moving any of them or changing the relation. */
export function validateScopeMove(
  ctx: WorldContext,
  relation: Relation,
  entity: Entity,
  target: Entity | undefined
): boolean {
  if (!validateScopeParent(ctx, relation, entity, target)) return false;
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

/** Each segment is a local lookup under the entity resolved by the preceding segment. */
export function lookupIdentifierPath(
  ctx: WorldContext,
  start: IdentifierPair | Entity,
  path: IdentifierPair[],
  length: number
): Entity | undefined {
  let scope: Entity | undefined;
  if (typeof start === 'number') {
    if (!ctx.isRegistered || !isEntityAlive(ctx.entityIndex, start)) return;
    scope = start;
  } else {
    scope = lookupIdentifier(ctx, start);
  }
  for (let i = 0; i < length && scope !== undefined; i++) {
    scope = lookupScopedIdentifier(ctx, scope, path[i]);
  }
  return scope;
}

/** Keep common two- and three-key paths scalar so the JIT can eliminate temporary terms. */
export /* @inline */ function lookupShortIdentifierPath(
  ctx: WorldContext,
  start: IdentifierPair | Entity,
  second: IdentifierPair,
  third: IdentifierPair | undefined,
  rest: IdentifierPair[]
): Entity | undefined {
  let scope =
    typeof start === 'number' ? lookupScopeEntity(ctx, start) : lookupIdentifier(ctx, start);
  if (scope === undefined) return;
  scope = lookupScopedIdentifier(ctx, scope, second);
  if (third !== undefined && scope !== undefined) scope = lookupScopedIdentifier(ctx, scope, third);
  if (rest.length !== 0 && scope !== undefined) {
    return lookupIdentifierPath(ctx, scope, rest, rest.length);
  }
  return scope;
}

/** Entity-started lookups reject foreign and recycled handles before reading parent-id buckets. */
export /* @pure */ function lookupScopeEntity(ctx: WorldContext, entity: Entity): Entity | undefined {
  return ctx.isRegistered && isEntityAlive(ctx.entityIndex, entity) ? entity : undefined;
}
