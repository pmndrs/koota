import type { Entity } from '../../entity/types';
import type { TraitInstance } from '../../trait/types';
import type { WorldContext } from '../../world';
import { addEntityToQuery, removeEntityFromQuery } from '../query';
import { checkQueryTracking } from './check-query-tracking';
import { checkQueryTrackingWithRelations } from './check-query-tracking-with-relations';

/** Advance the revision and notify registered Changed queries. */
export /* @inline */ function markTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
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
