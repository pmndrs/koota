import { createEmptyMaskGeneration } from '../../entity/utils/paged-mask';
import type { WorldContext } from '../types';

export function incrementWorldBitflag(ctx: WorldContext) {
  ctx.bitflag *= 2;

  if (ctx.bitflag >= 2 ** 31) {
    ctx.bitflag = 1;
    ctx.entityMasks.push(createEmptyMaskGeneration());
    ctx.retainedMasks.push(0);
    ctx.traitsByBit.push([]);
  }
}
