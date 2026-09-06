import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';

export type Subscriber = (entity: Entity, target?: Entity) => void;

/** A slot holds one subscriber directly and only becomes a Set on the second subscriber. */
type Slot = Subscriber | Set<Subscriber>;

/**
 * Subscribers for one trait event. World subscribers fire for every entity.
 * Entity subscribers are paged by entity id like the masks and fire for one
 * entity, so dispatch does not scale with the number of subscribed entities.
 * entityCount lets emit and destroy skip the page lookup when nothing is registered.
 */
export type Subscriptions = {
  all: Set<Subscriber>;
  byEntity: ((Slot | undefined)[] | undefined)[];
  /** Number of entities with at least one subscriber. */
  entityCount: number;
};

export function createSubscriptions(): Subscriptions {
  return { all: new Set(), byEntity: [], entityCount: 0 };
}

/** @inline */
export function hasSubscribers(subs: Subscriptions): boolean {
  return subs.all.size !== 0 || subs.entityCount !== 0;
}

export function subscribeEntity(
  subs: Subscriptions,
  entity: Entity,
  callback: Subscriber
): () => void {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;

  let page = subs.byEntity[pageId];
  if (!page) page = subs.byEntity[pageId] = [];

  const slot = page[offset];
  if (slot === undefined) {
    page[offset] = callback;
    subs.entityCount++;
  } else if (typeof slot === 'function') {
    if (slot !== callback) {
      page[offset] = new Set([slot, callback]);
    }
  } else {
    slot.add(callback);
  }

  return () => {
    // A dead entity was cleared on destroy and its id may now belong to another entity.
    if (!entity.isAlive()) return;
    const current = page[offset];
    if (current === undefined) return;
    if (current === callback) {
      page[offset] = undefined;
      subs.entityCount--;
    } else if (typeof current !== 'function' && current.delete(callback) && current.size === 0) {
      page[offset] = undefined;
      subs.entityCount--;
    }
  };
}

/** Drop every entity subscriber for an entity so a recycled id never inherits them. */
export function clearEntity(subs: Subscriptions, entity: Entity) {
  if (subs.entityCount === 0) return;
  const eid = getEntityId(entity);
  const page = subs.byEntity[eid >>> 10];
  if (!page) return;
  const slot = page[eid & 1023];
  if (slot === undefined) return;
  // Stops an in-flight dispatch that is still iterating this set.
  if (typeof slot !== 'function') slot.clear();
  page[eid & 1023] = undefined;
  subs.entityCount--;
}

/**
 * Invoke world subscribers then entity subscribers. The entity slot is read
 * after the world subscribers run so one of them can unsubscribe it. Plain
 * traits call with the entity alone so callbacks keep their one argument arity.
 */
export function emit(subs: Subscriptions, entity: Entity, target?: Entity) {
  if (target === undefined) {
    for (const sub of subs.all) sub(entity);
    const slot = getSlot(subs, entity);
    if (slot === undefined) return;
    if (typeof slot === 'function') slot(entity);
    else for (const sub of slot) sub(entity);
  } else {
    for (const sub of subs.all) sub(entity, target);
    const slot = getSlot(subs, entity);
    if (slot === undefined) return;
    if (typeof slot === 'function') slot(entity, target);
    else for (const sub of slot) sub(entity, target);
  }
}

/**
 * A world subscriber may have destroyed the entity and spawned a replacement on
 * the same id, so the slot is only read for the generation the event belongs to.
 */
/** @inline */
function getSlot(subs: Subscriptions, entity: Entity): Slot | undefined {
  if (subs.entityCount === 0 || !entity.isAlive()) return undefined;
  const eid = getEntityId(entity);
  const page = subs.byEntity[eid >>> 10];
  return page && page[eid & 1023];
}
