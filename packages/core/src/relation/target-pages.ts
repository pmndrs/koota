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
    (relation[$internal].sharedTargets ??= [])[pageId] = page;
  }
  return page;
}

/** Drop a shared world's target pages before their ids can be leased again. */
export function clearSharedTargetPages(ctx: WorldContext) {
  for (const relation of ctx.relations) {
    const def = relation[$internal];
    const pages = def.sharedTargets;
    if (!pages) continue;
    if (def.trait[$internal].sharedMask.users === 1) {
      def.sharedTargets = undefined;
    } else if (ctx.traitInstances[def.trait.id]?.relationTargets) {
      for (const pageId of ctx.entityIndex.ownedPages) {
        if (pages[pageId] !== undefined) pages[pageId] = undefined;
      }
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
