import { createEmptyMaskGeneration } from '../../entity/utils/paged-mask';
import type { WorldInternal } from '../types';

export /* @inline */ function incrementWorldBitflag(ctx: WorldInternal) {
    ctx.bitflag *= 2;

    if (ctx.bitflag >= 2 ** 31) {
        ctx.bitflag = 1;
        ctx.entityMasks.push(createEmptyMaskGeneration());

        for (const m of ctx.dirtyMasks.values()) m.push(createEmptyMaskGeneration());
        for (const m of ctx.changedMasks.values()) m.push(createEmptyMaskGeneration());
        for (const m of ctx.trackingSnapshots.values()) m.push(createEmptyMaskGeneration());
    }
}
