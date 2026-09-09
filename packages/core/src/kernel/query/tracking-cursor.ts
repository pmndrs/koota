import { cloneMaskGenerations, createZeroedMaskLike } from '../entity/paged-mask';
import type { KernelContext } from '../context';

let cursor = 3;

export function createTrackingId() {
  return cursor++;
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
