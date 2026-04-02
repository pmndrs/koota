import type { World } from '../types';

/** @deprecated No longer needed — bitSet-based membership replaces bitmask generations. */
export /* @inline */ function incrementWorldBitflag(_world: World) {
    // No-op: bitmask generation system removed in favor of per-trait HiSparseBitSets.
}
