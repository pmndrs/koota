import type { SparseSet } from '@koota/collections';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { notifyQuerySubscribers } from './hooks';
import { resetQueryTrackingBitmasks } from './tracking';
import type { QueryInstance } from './types';

/**
 * A for...of iterator reads the exposed array with no defer scope. A change while one may still
 * read it moves the set to a fresh array instead, so the iterator keeps the sequence it started
 * with. The readers left behind hold the old array and are no longer counted.
 */
export function detachWalkedSet(query: QueryInstance) {
  query.exposed.detach();
  query.readers = 0;
}

/** Expired history leaves both batches without emitting a second removal event. */
export function evictEntityFromQuery(query: QueryInstance, entity: Entity) {
  // Tracking queries reset on spawn. Identifier queries are outside that list.
  if (query.identifierFilters !== undefined) {
    resetQueryTrackingBitmasks(query, getEntityId(entity));
  }
  if (query.readers !== 0) detachWalkedSet(query);
  if (query.entities.length !== 0) query.entities.remove(entity);
  if (query.exposed.length !== 0) query.exposed.remove(entity);
  query.version++;
}

export function addEntityToQuery(query: QueryInstance, entity: Entity) {
  if (query.rechecks || query.ctx.queryBatch !== undefined) {
    if (!enterQuery(query, entity)) return;
  } else query.entities.add(entity);
  query.version++;

  if (query.addSubscriptions !== null || query.removeSubscriptions !== null) {
    notifyQuerySubscribers(query, entity, true);
  }
}

/**
 * Callback walks defer the structural changes that reach here, and a for...of reader is detached
 * first, so the removal can always apply at once.
 */
export function removeEntityFromQuery(query: QueryInstance, entity: Entity) {
  if (!query.entities.has(entity)) return;
  if (query.readers !== 0) detachWalkedSet(query);
  query.entities.remove(entity);
  query.version++;

  if (query.removeSubscriptions !== null || query.addSubscriptions !== null) {
    notifyQuerySubscribers(query, entity, false);
  }
}

/**
 * Adds to a query that can already hold the entity. The set ignores a repeated add, so an
 * unchanged length means nothing entered. Tracking queries collect every event.
 */
function enterQuery(query: QueryInstance, entity: Entity) {
  const entities = query.entities;
  const held = entities.length;
  entities.add(entity);
  return entities.length !== held || query.isTracking;
}

/** Points every live view of a tracking query at the batch it now exposes. */
export function exposeQuerySet(query: QueryInstance, set: SparseSet) {
  // Batch sets are reused, so array identity cannot identify their contents.
  query.layoutCache = null;
  query.version++;
  query.exposed = set;
  const bindings = query.viewBindings;
  for (let i = 0; i < bindings.length; i++) {
    const view = bindings[i].view;
    if (view !== null) view.source = set;
  }
}
