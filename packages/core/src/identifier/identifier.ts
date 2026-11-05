import { $internal, type Brand } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import { isEntityDestroying } from '../entity/entity';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/utils/entity-index';
import { getEntityId } from '../entity/utils/pack-entity';
import { addEntityToQuery, removeEntityFromQuery } from '../query/query';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import { markTraitChanged } from '../query/utils/mark-tracked-trait-changed';
import { emit, emitSubscribers, hasSubscribers } from '../trait/subscriptions';
import { grantTraitMembership, reconcileQueries, registerTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { TraitInstance } from '../trait/types';
import type { QueryInstance } from '../query/types';
import type { WorldContext } from '../world';
import { $identifier, $identifierPair } from './symbols';
import type { Identifier, IdentifierKey, IdentifierPair } from './types';

export function identifier<K extends IdentifierKey = string>(): Identifier<K> {
  const backing = trait();
  const Identifier = Object.assign(
    (target: K): IdentifierPair<K> => {
      if (typeof target !== 'string' && (typeof target !== 'number' || !Number.isFinite(target))) {
        throw new Error('Koota: Identifier keys must be strings or finite numbers.');
      }
      return { [$identifierPair]: true, identifier: Identifier, target };
    },
    { [$internal]: { trait: backing } }
  ) as Identifier<K>;
  Object.defineProperties(Identifier, {
    [$identifier]: { value: true },
    id: { value: backing.id, enumerable: true },
  });
  backing[$internal].isIdentifier = true;
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
  return ctx.traitInstances[pair.identifier.id]?.identifier?.owners.get(pair.target);
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
  if (isEntityDestroying(entity)) return;
  const trait = pair.identifier[$internal].trait;
  let data = getTraitInstance(ctx.traitInstances, trait);
  if (!data) {
    registerTrait(ctx, trait);
    data = getTraitInstance(ctx.traitInstances, trait);
  }
  // Earlier assignments or registration callbacks may have destroyed the source.
  if (!data || !isEntityAlive(ctx.entityIndex, entity)) return;
  const index = data.identifier!;
  const owner = index.owners.get(pair.target);
  if (owner === entity) return;
  if (owner !== undefined) {
    if (assertsEnabled) {
      throw new Error(
        `Koota: [IDENTIFIER_TAKEN] Identifier ${trait.id} key ${JSON.stringify(pair.target)} belongs to entity ${owner}.`
      );
    }
    return;
  }

  const eid = getEntityId(entity);
  const page = (index.targets[eid >>> 10] ??= []);
  const previous = page[eid & 1023];
  if (previous !== undefined) index.owners.delete(previous);
  index.owners.set(pair.target, entity);
  page[eid & 1023] = pair.target;

  notifyIdentifierAssignment(ctx, entity, data, pair, previous);
}

/** Publish the committed mapping, allowing callbacks to replace or remove it. */
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
  // Query and removal subscribers may have replaced or removed this assignment.
  if (lookupIdentifier(ctx, pair) !== entity) return;
  if (hasSubscribers(data.addSubscriptions)) {
    emitSubscribers(data.addSubscriptions, entity, pair.target);
    if (lookupIdentifier(ctx, pair) !== entity) return;
  }
  // Membership already recorded a first assignment for Changed queries. A replacement is a write.
  if (previous !== undefined) markTraitChanged(ctx, entity, data);
  // Changed query subscribers can also replace the assignment before onChange runs.
  if (hasSubscribers(data.changeSubscriptions) && lookupIdentifier(ctx, pair) === entity) {
    emitSubscribers(data.changeSubscriptions, entity, pair.target);
  }
}

/** Release the mapping before membership and callbacks observe its removal. */
export function releaseIdentifier(entity: Entity, data: TraitInstance): IdentifierKey {
  const eid = getEntityId(entity);
  const index = data.identifier!;
  const page = index.targets[eid >>> 10];
  const target = page[eid & 1023]!;
  index.owners.delete(target);
  page[eid & 1023] = undefined;
  return target;
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

/** Reconcile the static queries that filter by a key after it changed owner. */
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
    if (!matches) removeEntityFromQuery(ctx, query, entity);
    // Replacement is not a tracked event, so an entity already in the batch is not added again.
    else if (!query.entities.has(entity) || query.toRemove?.has(entity)) {
      addEntityToQuery(query, entity);
    }
  }
}

export function matchesIdentifiers(
  ctx: WorldContext,
  entity: Entity,
  pairs: IdentifierPair[]
): boolean {
  for (const pair of pairs) if (lookupIdentifier(ctx, pair) !== entity) return false;
  return true;
}
