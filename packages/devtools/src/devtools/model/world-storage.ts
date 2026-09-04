import { $internal, type World } from '@koota/core';

export interface WorldStorage {
  entitiesAlive: number;
  entityPages: number;
  entityCapacity: number;
  entityDensity: number;
  entityMaskPages: number;
  trackingMaskPages: number;
  trackers: number;
  trackedTraits: number;
}

/**
 * Mask pages are lazily materialized; untouched ones all point at one shared zero page.
 * The last page slot is never leased in practice, so its reference is that sentinel.
 */
function countMaskPages(generations: Uint32Array[][]): number {
  let pages = 0;
  for (const gen of generations) {
    const sentinel = gen[gen.length - 1];
    for (const page of gen) if (page !== sentinel) pages++;
  }
  return pages;
}

/** The small set of storage signals useful when inspecting a world. */
export function readWorldStorage(world: World): WorldStorage {
  const ctx = world[$internal];
  const index = ctx.entityIndex;
  const entityPages = index?.ownedPages.length ?? 0;
  const entitiesAlive = index?.aliveCount ?? 0;
  const entityCapacity = entityPages * (ctx.entityMasks[0]?.[0]?.length ?? 0);
  let trackingMaskPages = 0;
  for (const masks of ctx.dirtyMasks.values()) trackingMaskPages += countMaskPages(masks);
  for (const masks of ctx.trackingSnapshots.values()) trackingMaskPages += countMaskPages(masks);
  for (const masks of ctx.changedMasks.values()) trackingMaskPages += countMaskPages(masks);

  return {
    entitiesAlive,
    entityPages,
    entityCapacity,
    entityDensity: entityCapacity === 0 ? 0 : Math.round((entitiesAlive / entityCapacity) * 100),
    entityMaskPages: countMaskPages(ctx.entityMasks),
    trackingMaskPages,
    trackers: ctx.trackingSnapshots.size,
    trackedTraits: ctx.trackedTraits.size,
  };
}
