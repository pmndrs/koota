import { PAGE_SIZE } from '../../entity/utils/pack-entity';
import { growPageTable } from '../../utils/page-table';
import type { WorldContext } from '../../world/types';

/**
 * Shared sentinel for unallocated tracker pages. Trackers hold one word per entity. Always
 * reads as 0. Never write to it directly.
 */
export const EMPTY_TRACKER_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE);

/** Materialize a tracker page on first write. */
export /* @inline */ function ensureTrackerPage(gen: Uint32Array[], pageId: number): Uint32Array {
  let page = gen[pageId];
  if (page === EMPTY_TRACKER_PAGE) {
    page = new Uint32Array(PAGE_SIZE);
    gen[pageId] = page;
  }
  return page;
}

/** Extend the tracker tables of every query to cover the page limit. */
export function growTrackerTables(ctx: WorldContext, pageLimit: number) {
  for (const query of ctx.queriesHashMap.values()) {
    const groups = query.trackingGroups;
    for (let i = 0; i < groups.length; i++) {
      const trackers = groups[i].trackers;
      for (let j = 0; j < trackers.length; j++) {
        if (trackers[j]) growPageTable(trackers[j], pageLimit, EMPTY_TRACKER_PAGE);
      }
    }
  }
}
