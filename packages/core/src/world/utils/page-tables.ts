import { growTrackerTables } from '../../query/utils/tracker-pages';
import { growPageTable } from '../../utils/page-table';
import type { WorldContext } from '../types';
import { EMPTY_MASK_PAGE } from './entity-masks';

/**
 * Every mask and tracker table in a world covers the highest page the world has leased, so a
 * read for any of its entities finds a page. This is the number of pages they cover.
 */
export /* @pure */ function getPageLimit(ctx: WorldContext): number {
  return ctx.entityMasks[0].length;
}

/** Extend every table of the world when it leases a page past the ones they cover. */
export function growPageTables(ctx: WorldContext, pageLimit: number) {
  const masks = ctx.entityMasks;
  for (let g = 0; g < masks.length; g++) growPageTable(masks[g], pageLimit, EMPTY_MASK_PAGE);
  growTrackerTables(ctx, pageLimit);
}
