import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { PENDING_WORD } from '../../entity/utils/paged-mask';
import type { TraitInstance } from '../../trait/types';
import type { WorldContext } from '../../world';
import { addEntityToQuery, removeEntityFromQuery } from '../query';
import type { QueryInstance } from '../types';
import { passesQueryFilters } from './check-query-filters';
import {
  checkQueryTracking,
  passesStaticBitmasks,
  recordChangeAndMatch,
  recordTrackerHit,
} from './check-query-tracking';

/** Advance the revision and notify registered Changed queries. */
export /* @inline */ function markTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (data.trackingQueries.length !== 0) notifyChangedTrackingQueries(ctx, entity, data);
}

/**
 * Re-evaluate the Changed queries of a written trait. A query whose static terms reject the
 * entity only records the write. When every query rejects it, running them again changes nothing
 * until the entity's traits change. The pending bit records that, so later writes return on it.
 */
export function notifyChangedTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  const { generationId, bitflag } = data;
  const entityMasks = ctx.entityMasks;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  const page = entityMasks[generationId][pageId];
  if ((page[slot + PENDING_WORD] & bitflag) !== 0) return;
  // An unchecked write can reach here without the trait, on a page that may be the shared sentinel.
  if ((page[slot] & bitflag) === 0) return;

  const queries = data.trackingQueries;
  let accepted = false;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if ((query.changedMasks[generationId] & bitflag) === 0) continue;

    // Identifier filters and mixed or terms need current membership and tracked events.
    if (query.identifierFilters !== undefined || query.filters?.tracking) {
      accepted = true;
      if (checkQueryTracking(ctx, query, entity, 'change', generationId, bitflag)) {
        addEntityToQuery(query, entity);
      } else removeEntityFromQuery(ctx, query, entity);
      continue;
    }

    // A rejected entity left the batch when it lost the static terms, so only the write is kept.
    if (!passesStaticBitmasks(query.masks, entityMasks, pageId, slot, query.retains)) {
      recordChange(query, generationId, eid, bitflag);
      continue;
    }

    accepted = true;
    if (
      recordChangeAndMatch(query, generationId, eid, bitflag) &&
      (query.filters === null || passesQueryFilters(ctx, query, entity))
    ) {
      addEntityToQuery(query, entity);
    } else removeEntityFromQuery(ctx, query, entity);
  }

  if (!accepted) {
    page[slot + PENDING_WORD] |= bitflag;
    ctx.defersChanges = true;
  }
}

/** Mark the trait written in the Changed groups of a query without evaluating it. */
function recordChange(query: QueryInstance, generationId: number, eid: number, bitflag: number) {
  const groups = query.trackingGroups;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (
      group.type === 'change' &&
      (group.bitmasks[generationId]! & bitflag) !== 0 &&
      group.pairs === null
    ) {
      recordTrackerHit(group.trackers, generationId, eid, bitflag);
    }
  }
}

/**
 * Clear the pending bits of an entity so its next writes are evaluated again. Every Changed
 * query already holds the deferred writes in its own tracker, so nothing is copied.
 */
export function clearPendingChanges(ctx: WorldContext, eid: number) {
  const entityMasks = ctx.entityMasks;
  const pageId = eid >>> 10;
  const index = ((eid & 1023) << 2) + PENDING_WORD;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page[index] !== 0) page[index] = 0;
  }
}
