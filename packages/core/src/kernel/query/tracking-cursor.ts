import { universe } from '../universe';
import { cloneMaskGenerations, createZeroedMaskLike } from '../entity/paged-mask';
import type { KernelContext } from '../context';

let cursor = 3;

export function createTrackingId() {
  const id = cursor++;
  for (const ctx of universe.contexts) {
    if (ctx) setTrackingMasks(ctx, id);
  }
  return id;
}

export function getTrackingCursor() {
  return cursor;
}

export function setTrackingMasks(ctx: KernelContext, id: number) {
  const snapshot = cloneMaskGenerations(ctx.entityMasks);
  ctx.trackingSnapshots.set(id, snapshot);
  ctx.dirtyMasks.set(id, createZeroedMaskLike(snapshot));
  ctx.changedMasks.set(id, createZeroedMaskLike(snapshot));
}
