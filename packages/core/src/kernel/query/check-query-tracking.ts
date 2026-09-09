import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/pack-entity';
import { EMPTY_MASK_PAGE, ensureMaskPage } from '../entity/paged-mask';
import type { KernelContext } from '../context';
import type { EventType, QueryInstance } from './types';
import { checkQuery } from './check-query';

/** Record every affected group before applying static or tracking match conditions. */
export function checkQueryTracking(
  ctx: KernelContext,
  query: QueryInstance,
  entity: Entity,
  eventType: EventType,
  eventGenerationId: number,
  eventBitflag: number
): boolean {
  if (ctx.implicitEntities.has(entity)) return false;
  const id = getEntityId(entity);
  const pageId = id >>> 10;
  const offset = id & 1023;
  let invalidated = false;
  for (let i = 0; i < query.trackingGroups.length; i++) {
    const group = query.trackingGroups[i];
    if (!(group.bitmasks[eventGenerationId]! & eventBitflag)) continue;
    const masks = group.trackers[eventGenerationId];
    if (group.type === eventType) {
      if (eventType !== 'change' || ctx.entityMasks[eventGenerationId][pageId][offset] & eventBitflag)
        ensureMaskPage(masks, pageId)[offset] |= eventBitflag;
    } else if (eventType !== 'change') {
      invalidated ||= group.logic === 'and';
      const page = masks[pageId];
      if (page !== EMPTY_MASK_PAGE) page[offset] &= ~eventBitflag;
    }
  }
  return !invalidated && checkQuery(ctx, query, entity);
}

/** Seed complete and partial groups from history so first reads use the live matcher. */
export function seedQueryTracking(ctx: KernelContext, query: QueryInstance): void {
  const entities = ctx.entityIndex.dense;
  const count = ctx.entityIndex.aliveCount;
  for (let i = 0; i < query.trackingGroups.length; i++) {
    const group = query.trackingGroups[i];
    const snapshot = ctx.trackingSnapshots.get(group.id)!;
    const dirty = ctx.dirtyMasks.get(group.id)!;
    const changed = ctx.changedMasks.get(group.id)!;
    for (let generation = 0; generation < group.bitmasks.length; generation++) {
      const mask = group.bitmasks[generation];
      if (!mask) continue;
      const currentMasks = ctx.entityMasks[generation];
      const oldMasks = snapshot[generation];
      const dirtyMasks = dirty[generation];
      const changedMasks = changed[generation];
      const trackers = group.trackers[generation];
      for (let j = 0; j < count; j++) {
        const entity = entities[j];
        if (ctx.implicitEntities.has(entity)) continue;
        const id = getEntityId(entity);
        const pageId = id >>> 10;
        const offset = id & 1023;
        const current = currentMasks[pageId][offset];
        const previous = oldMasks[pageId][offset];
        const mutations = dirtyMasks[pageId][offset];
        const bits =
          mask &
          (group.type === 'add'
            ? current & (~previous | mutations)
            : group.type === 'remove'
              ? ~current & (previous | mutations)
              : current & changedMasks[pageId][offset]);
        if (bits) ensureMaskPage(trackers, pageId)[offset] = bits;
      }
    }
  }
}
