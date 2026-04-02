import { $internal } from '../../common';
import { HiSparseBitSet } from '@koota/collections';
import type { World } from '../../world';

// Some values are reserved.
// 0 - has
// 1 - not
// 2 - or
let cursor = 3;

export function createTrackingId() {
    return cursor++;
}

export function getTrackingCursor() {
    return cursor;
}

export function setTrackingMasks(world: World, id: number) {
    const ctx = world[$internal];

    // Snapshot current trait membership as Map<traitId, HiSparseBitSet> using bitSet.clone()
    const snapshotMap = new Map<number, HiSparseBitSet>();
    for (const inst of ctx.traitInstances) {
        if (inst) snapshotMap.set(inst.definition.id, inst.bitSet.clone());
    }
    ctx.trackingSnapshots.set(id, snapshotMap);

    // Initialize HiSparseBitSet maps for this tracking ID
    ctx.addedBitSets.set(id, new Map());
    ctx.removedBitSets.set(id, new Map());
    ctx.changedBitSets.set(id, new Map());

    // Initialize parallel pair tracking arrays indexed by this tracking ID.
    ctx.pairDirtyMasks[id] = [];
    ctx.pairChangedMasks[id] = [];
}
