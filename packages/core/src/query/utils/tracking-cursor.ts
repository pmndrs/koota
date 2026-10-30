import { cloneMaskGenerations, createZeroedMaskLike } from '../../entity/utils/paged-mask';
import type { WorldContext } from '../../world';

type TrackingKind = 'add' | 'remove' | 'change';

// Ids 0 to 2 belong to the has, not and or modifiers, which track nothing.
let cursor = 3;
const kinds: TrackingKind[] = [];

export function createTrackingId(kind: TrackingKind) {
  kinds[cursor] = kind;
  return cursor++;
}

export function getTrackingCursor() {
  return cursor;
}

/**
 * Gives a world the mask tables one tracking modifier reads. Each table map stays empty until a
 * modifier of that kind exists, which lets the write paths skip tracking work entirely.
 */
export function setTrackingMasks(ctx: WorldContext, id: number) {
  const kind = kinds[id];
  if (kind === undefined) return;
  if (kind === 'change') {
    ctx.changedMasks.set(id, createZeroedMaskLike(ctx.entityMasks));
    return;
  }
  const snapshot = cloneMaskGenerations(ctx.entityMasks);
  ctx.trackingSnapshots.set(id, snapshot);
  ctx.dirtyMasks.set(id, createZeroedMaskLike(snapshot));
}
