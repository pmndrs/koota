import type { Entity } from '../types';

/** Destroyed entity handles in destroy order. Capacity is zero or a power of two. */
export type HandleRing = {
  ids: Int32Array;
  head: number;
  count: number;
};

export /* @inline */ function pushHandle(ring: HandleRing, entity: Entity): void {
  const count = ring.count;
  if (count === ring.ids.length) growHandleRing(ring);
  const tail = (ring.head + count) & (ring.ids.length - 1);
  ring.ids[tail] = entity;
  ring.count = count + 1;
}

export function growHandleRing(ring: HandleRing) {
  const old = ring.ids;
  const count = ring.count;
  const ids = new Int32Array(Math.max(16, old.length * 2));
  for (let i = 0; i < count; i++) {
    const from = (ring.head + i) & (old.length - 1);
    ids[i] = old[from];
  }
  ring.ids = ids;
  ring.head = 0;
}
