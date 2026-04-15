import type { WorldContext } from '../../world';

let cursor = 3;

export function createTrackingId() {
    return cursor++;
}

export function getTrackingCursor() {
    return cursor;
}

export function setTrackingMasks(ctx: WorldContext, id: number) {
    ctx.addedBitSets.set(id, new Map());
    ctx.removedBitSets.set(id, new Map());
    ctx.changedBitSets.set(id, new Map());
}
