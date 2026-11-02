import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { CHANGED_WORD } from '../../entity/utils/paged-mask';
import type { TraitInstance } from '../../trait/types';
import type { WorldContext } from '../../world';
import { addEntityToQuery, removeEntityFromQuery } from '../query';
import { checkQueryTracking } from './check-query-tracking';
import { checkQueryTrackingWithRelations } from './check-query-tracking-with-relations';

/**
 * Record a write. Watched traits keep a history bit so a Changed query created later still sees
 * the write, and the tracking queries that already exist are re-evaluated out of line.
 */
export /* @inline */ function markTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (data.tracked) {
    const eid = getEntityId(entity);
    ctx.entityMasks[data.generationId][eid >>> 10][((eid & 1023) << 2) + CHANGED_WORD] |=
      data.bitflag;
  }
  if (data.trackingQueries.length !== 0) notifyChangedTrackingQueries(ctx, entity, data);
}

/** Re-evaluate the tracking queries that watch this trait for changes. */
export function notifyChangedTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  const { generationId, bitflag } = data;
  const queries = data.trackingQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (!query.hasChangedModifiers) continue;
    if (!query.changedTraits.includes(data.trait)) continue;

    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', generationId, bitflag)
        : checkQueryTracking(ctx, query, entity, 'change', generationId, bitflag);
    if (match) addEntityToQuery(query, entity);
    else removeEntityFromQuery(ctx, query, entity);
  }
}
