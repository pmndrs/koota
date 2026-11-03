import type { Entity } from '../types';

/**
 * A growable ring of entity handles in push order. Each entry carries the serial a reader
 * compares its runs against, so the head is released once every reader has moved past it.
 */
export type HandleRing = {
  ids: Int32Array;
  serials: Float64Array;
  head: number;
  count: number;
  /** Handles shifted off the head so far, so the head sits at this position in push order. */
  released: number;
};

export function createHandleRing(capacity: number): HandleRing {
  return {
    ids: new Int32Array(capacity),
    serials: new Float64Array(capacity),
    head: 0,
    count: 0,
    released: 0,
  };
}

export function pushHandle(ring: HandleRing, entity: Entity, serial: number): void {
  const count = ring.count;
  if (count === ring.ids.length) growHandleRing(ring);
  const tail = (ring.head + count) % ring.ids.length;
  ring.ids[tail] = entity;
  ring.serials[tail] = serial;
  ring.count = count + 1;
}

/**
 * Moves the handle at an offset from the head to another ring, keeping its serial and the order
 * of the rest. The entries behind it move up one position.
 */
export function moveHandle(from: HandleRing, offset: number, to: HandleRing): void {
  const capacity = from.ids.length;
  let index = (from.head + offset) % capacity;
  const entity = from.ids[index] as Entity;
  const serial = from.serials[index];
  for (let i = offset + 1; i < from.count; i++) {
    const next = (from.head + i) % capacity;
    from.ids[index] = from.ids[next];
    from.serials[index] = from.serials[next];
    index = next;
  }
  from.count--;
  pushHandle(to, entity, serial);
}

/** Takes the oldest handle. The caller checks the count first. */
export /* @inline */ function shiftHandle(ring: HandleRing): Entity {
  const head = ring.head;
  const entity = ring.ids[head] as Entity;
  ring.head = (head + 1) % ring.ids.length;
  ring.count--;
  ring.released++;
  return entity;
}

/** The handle at a position counted from the oldest. */
export /* @inline */ function handleAt(ring: HandleRing, offset: number): Entity {
  return ring.ids[(ring.head + offset) % ring.ids.length] as Entity;
}

/** The oldest handle may be released once it is past the window and every reader has consumed it. */
export /* @inline */ function canReleaseHead(
  ring: HandleRing,
  retain: number,
  consumedSerial: number
): boolean {
  const count = ring.count;
  return count > retain && (ring.serials[ring.head] <= consumedSerial || count > retain * 16);
}

export function clearHandleRing(ring: HandleRing): void {
  ring.released = 0;
  ring.head = 0;
  ring.count = 0;
}

export function growHandleRing(ring: HandleRing) {
  const old = ring.ids;
  const oldSerials = ring.serials;
  const count = ring.count;
  const ids = new Int32Array(Math.max(16, old.length * 2));
  const serials = new Float64Array(ids.length);
  for (let i = 0; i < count; i++) {
    const from = (ring.head + i) % old.length;
    ids[i] = old[from];
    serials[i] = oldSerials[from];
  }
  ring.ids = ids;
  ring.serials = serials;
  ring.head = 0;
}
