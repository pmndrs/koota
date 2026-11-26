import { createPageTable } from '../../utils/page-table';
import type { WorldContext } from '../types';
import { EMPTY_MASK_PAGE } from './entity-masks';
import { getPageLimit } from './page-tables';

export function incrementWorldBitflag(ctx: WorldContext) {
  ctx.bitflag *= 2;

  if (ctx.bitflag >= 2 ** 31) {
    ctx.bitflag = 1;
    ctx.entityMasks.push(createPageTable(getPageLimit(ctx), EMPTY_MASK_PAGE));
    ctx.traitsByBit.push([]);
  }
}
