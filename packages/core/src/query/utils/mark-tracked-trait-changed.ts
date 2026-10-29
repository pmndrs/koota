import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { ensureMaskPage } from '../../entity/utils/paged-mask';
import type { TraitInstance } from '../../trait/types';
import type { WorldContext } from '../../world';
import { checkQueryTrackingWithRelations } from './check-query-tracking-with-relations';

/** Keep tracked work outside the inlined setter notification path. */
export function markTrackedTraitChanged(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  markTraitChanged(ctx, entity, data);
}

export /* @inline */ function markTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (ctx.changedMasks.size !== 0) markChangedMasks(ctx, entity, data);
  if (data.trackingQueries.size !== 0) notifyChangedTrackingQueries(ctx, entity, data);
}

/** Record the change in every changed mask snapshot. */
export function markChangedMasks(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  const { generationId, bitflag } = data;
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  for (const changedMask of ctx.changedMasks.values()) {
    ensureMaskPage(changedMask[generationId], pageId)[offset] |= bitflag;
  }
}

/** Re-evaluate the tracking queries that watch this trait for changes. */
export function notifyChangedTrackingQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  const { generationId, bitflag } = data;
  for (const query of data.trackingQueries) {
    if (!query.hasChangedModifiers) continue;
    if (!query.changedTraits.has(data.trait)) continue;

    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'change', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }
}
