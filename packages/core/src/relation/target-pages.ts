import { getEntityId } from '../entity/handle';
import { sharedAllocator } from '../entity/page-allocator';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type { Relation, RelationTarget, RelationTargetPages } from './types';

/** Entity methods and world methods read the same page. Isolated worlds own theirs locally. */
export function createTargetPage(
  ctx: WorldContext,
  relation: Relation,
  instance: TraitInstance,
  pageId: number
) {
  const page: (Entity | Entity[] | undefined)[] = [];
  (instance.relationTargets ??= [])[pageId] = page;
  if (ctx.entityIndex.allocator === sharedAllocator) {
    const def = relation[$internal];
    (def.sharedTargets ??= [])[pageId] = page;
    def.sharedTargetPageCount++;
  }
  return page;
}

/** Drop a shared world's target pages before their ids can be leased again. */
export function clearSharedTargetPages(ctx: WorldContext) {
  for (const relation of ctx.relations) {
    const def = relation[$internal];
    const owned = ctx.traitInstances[def.trait.id]?.relationTargets;
    if (!owned) continue;
    const pageIds = Object.keys(owned);
    def.sharedTargetPageCount -= pageIds.length;
    if (def.sharedTargetPageCount === 0) {
      def.sharedTargets = undefined;
    } else {
      const pages = def.sharedTargets!;
      for (const pageId of pageIds) pages[Number(pageId)] = undefined;
    }
  }
}

export /* @inline @pure */ function firstTargetInPages(
  pages: RelationTargetPages | undefined,
  entity: Entity
): Entity | undefined {
  const eid = getEntityId(entity);
  const entry = pages?.[eid >>> 10]?.[eid & 1023];
  return typeof entry === 'number' ? entry : entry?.[0];
}

export /* @inline @pure */ function hasTargetInPages(
  pages: RelationTargetPages | undefined,
  entity: Entity,
  target: RelationTarget,
  exclusive: boolean
): boolean {
  const eid = getEntityId(entity);
  const entry = pages?.[eid >>> 10]?.[eid & 1023];
  if (entry === undefined) return false;
  if (exclusive) return target === '*' || entry === target;
  const targets = entry as Entity[];
  return target === '*' ? targets.length !== 0 : targets.includes(target);
}
