import { cloneMaskGenerations, createZeroedMaskLike } from '../../entity/utils/paged-mask';
import type { WorldContext } from '../../world';

let cursor = 3;

export function createTrackingId() {
    return cursor++;
}

export function getTrackingCursor() {
    return cursor;
}

export function setTrackingMasks(ctx: WorldContext, id: number) {
    const snapshot = cloneMaskGenerations(ctx.entityMasks);
    ctx.trackingSnapshots.set(id, snapshot);
    ctx.dirtyMasks.set(id, createZeroedMaskLike(snapshot));
    ctx.changedMasks.set(id, createZeroedMaskLike(snapshot));
}
