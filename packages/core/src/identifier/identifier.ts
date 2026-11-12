import { $internal, type Brand } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { addEntityToQuery, removeEntityFromQuery } from '../query/query';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import { markTraitChanged } from '../query/utils/mark-tracked-trait-changed';
import { emit, emitSubscribers, hasSubscribers } from '../trait/subscriptions';
import { grantTraitMembership, reconcileQueries, registerTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { TraitInstance } from '../trait/types';
import type { QueryInstance } from '../query/types';
import { getIdentifierOwners, getScopeTarget } from './scoped-identifier';
import type { WorldContext } from '../world';
import { $identifier, $identifierPair } from './symbols';
import type {
  Identifier,
  IdentifierIndex,
  IdentifierKey,
  IdentifierOptions,
  IdentifierPair,
} from './types';

export function identifier<K extends IdentifierKey = string>(
  options?: IdentifierOptions
): Identifier<K> {
  const scope = options?.scope;
  if (scope !== undefined && !scope[$internal].exclusive) {
    throw new Error('Koota: [IDENTIFIER_SCOPE] A scoping relation must be exclusive.');
  }
  const backing = trait();
  const Identifier = Object.assign(
    (target: K): IdentifierPair<K> => {
      if (typeof target !== 'string' && (typeof target !== 'number' || !Number.isFinite(target))) {
        throw new Error('Koota: Identifier keys must be strings or finite numbers.');
      }
      return { [$identifierPair]: true, identifier: Identifier, target };
    },
    { [$internal]: { trait: backing, exclusive: options?.exclusive ?? true, scope } }
  ) as Identifier<K>;
  Object.defineProperties(Identifier, {
    [$identifier]: { value: true },
    id: { value: backing.id, enumerable: true },
  });
  backing[$internal].kind = 'identifier';
  backing[$internal].identifier = Identifier;
  if (scope !== undefined) (scope[$internal].scopedIdentifiers ??= []).push(Identifier);
  return Identifier;
}

export /* @inline @pure */ function isIdentifier(value: unknown): value is Identifier {
  return (value as Brand<typeof $identifier> | null | undefined)?.[$identifier] as unknown as boolean;
}

export /* @inline @pure */ function isIdentifierPair(value: unknown): value is IdentifierPair {
  return (value as Brand<typeof $identifierPair> | null | undefined)?.[
    $identifierPair
  ] as unknown as boolean;
}

export /* @inline @pure */ function lookupIdentifier(
  ctx: WorldContext,
  pair: IdentifierPair
): Entity | undefined {
  const owners = ctx.traitInstances[pair.identifier.id]?.identifier?.owners.get(pair.target);
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
  const scope = scopeRelation === undefined ? undefined : getScopeTarget(ctx, scopeRelation, entity);
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
export function releaseReplacedIdentifier(
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
export function notifyIdentifierAssignment(
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
export function releaseIdentifier(entity: Entity, data: TraitInstance): IdentifierKey {
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

/**
 * A static query that filters by key leaves the trait's query list for a list under its key.
 * Assigning or releasing a key then reconciles the queries for that key alone, however many
 * keys are queried. Tracking queries stay on the trait so they keep receiving its events.
 */
export function joinKeyQueries(ctx: WorldContext, query: QueryInstance, pair: IdentifierPair) {
  const queries = ctx.traitInstances[pair.identifier.id]!.identifier!.queries;
  const list = queries.get(pair.target);
  if (list === undefined) queries.set(pair.target, [query]);
  else if (!list.includes(query)) list.push(query);
}

export function leaveKeyQueries(ctx: WorldContext, query: QueryInstance, pair: IdentifierPair) {
  const queries = ctx.traitInstances[pair.identifier.id]?.identifier?.queries;
  const list = queries?.get(pair.target);
  if (list === undefined) return;
  // A dispatch keeps its old array when a callback removes a query.
  const rest = list.filter((other) => other !== query);
  if (rest.length === 0) queries!.delete(pair.target);
  else queries!.set(pair.target, rest);
}

/** Reconcile the static queries that filter by a key after an assignment changes. */
export function reconcileKeyQueries(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  key: IdentifierKey
) {
  const queries = data.identifier!.queries.get(key);
  if (queries !== undefined) reconcileQueries(ctx, entity, queries);
}

/** Replacement changes key-filtered tracking queries while presence stays the same. */
function refreshTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  for (const query of data.trackingQueries) {
    if (query.identifierFilters === undefined) continue;
    // A zero event mask checks existing history without recording another event.
    const matches = checkQueryTracking(ctx, query, entity, 'change', -1, 0);
    if (!matches) removeEntityFromQuery(query, entity);
    // Replacement is not a tracked event, so an entity already in the batch is not added again.
    else if (!query.entities.has(entity)) {
      addEntityToQuery(query, entity);
    }
  }
}

export function matchesIdentifiers(
  ctx: WorldContext,
  entity: Entity,
  pairs: IdentifierPair[]
): boolean {
  for (let i = 0; i < pairs.length; i++) {
    if (!hasIdentifier(ctx, entity, pairs[i])) return false;
  }
  return true;
}
