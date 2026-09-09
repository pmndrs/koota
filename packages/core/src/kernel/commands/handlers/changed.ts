import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/pack-entity';
import { EMPTY_MASK_PAGE, ensureMaskPage } from '../../entity/paged-mask';
import { emit, hasSubscribers } from '../../trait/subscriptions';
import { hasTrait } from '../../trait/trait';
import { getTraitInstance } from '../../trait/trait';
import type { Trait, TraitInstance } from '../../trait/types';
import { $internal } from '../../common';
import { hasRelationToTarget } from '../../relation/relation';
import type { KernelContext } from '../../context';
import { checkQueryTrackingWithRelations } from '../../query/check-query-tracking-with-relations';
import { invokeTraitHook } from '../lifecycle';

/** Publish an existing value after assignment or an explicit changed operation. */
export function publishChanged(
  ctx: KernelContext,
  entity: Entity,
  data: TraitInstance,
  target?: Entity
): void {
  const trait = data.trait;
  if (trait[$internal].hooks?.onSet) invokeTraitHook(ctx, entity, trait, 'onSet', target);
  data.version++;

  const eid = getEntityId(entity);
  const { generationId, bitflag } = data;
  const pageId = eid >>> 10;
  const offset = eid & 1023;

  for (const changedMask of ctx.changedMasks.values()) {
    ensureMaskPage(changedMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of data.trackingQueries) {
    if (!query.hasChangedModifiers) continue;
    if (!query.changedTraits.has(trait)) continue;

    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'change', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  if (hasSubscribers(data.changeSubscriptions)) emit(data.changeSubscriptions, entity, target);
}

/** Without callbacks or query consumers, mark history directly and skip row dispatch. */
export function publishChangedBatch(
  ctx: KernelContext,
  entities: ArrayLike<Entity>,
  count: number,
  instance: TraitInstance,
  target?: Entity
): void {
  if (
    !instance.trait[$internal].hooks?.onSet &&
    instance.trackingQueries.size === 0 &&
    !hasSubscribers(instance.changeSubscriptions)
  ) {
    const generation = instance.generationId;
    const bitflag = instance.bitflag;
    for (const generations of ctx.changedMasks.values()) {
      const masks = generations[generation];
      let previousPage = -1;
      let page = EMPTY_MASK_PAGE;
      for (let i = 0; i < count; i++) {
        const id = getEntityId(entities[i]);
        const pageId = id >>> 10;
        if (pageId !== previousPage) {
          page = ensureMaskPage(masks, pageId);
          previousPage = pageId;
        }
        page[id & 1023] |= bitflag;
      }
    }
    instance.version += count;
    return;
  }
  for (let i = 0; i < count; i++) publishChanged(ctx, entities[i], instance, target);
}

export function applyChanged(ctx: KernelContext, entity: Entity, trait: Trait): void {
  if (!hasTrait(ctx, entity, trait)) return;
  publishChanged(ctx, entity, getTraitInstance(ctx.traitInstances, trait)!);
}

export function applyPairChanged(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait,
  target: Entity
): void {
  const relation = trait[$internal].relation;
  if (!relation || !hasRelationToTarget(ctx, relation, entity, target)) return;
  publishChanged(ctx, entity, getTraitInstance(ctx.traitInstances, trait)!, target);
}
