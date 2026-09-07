import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { ensureMaskPage } from '../../entity/utils/paged-mask';
import { isRelation } from '../../relation/utils/is-relation';
import { emit, hasSubscribers } from '../../trait/subscriptions';
import { getTraitInstance } from '../../trait/trait-instance';
import type { ExtractTraits, Trait, TraitInstance, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import type { WorldContext } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { checkQueryTrackingWithRelations } from '../utils/check-query-tracking-with-relations';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
  const id = createTrackingId();

  for (const ctx of universe.worlds) {
    if (!ctx) continue;
    setTrackingMasks(ctx, id);
  }

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `changed-${number}`> => {
    const traits = inputs.map((input) =>
      isRelation(input) ? input[$internal].trait : input
    ) as ExtractTraits<T>;
    return createModifier(`changed-${id}`, id, traits);
  };
}

/**
 * Flag a trait as changed for an entity that has it. The change is recorded on
 * every tracking snapshot, the Changed queries for the trait are refreshed and
 * subscribers are notified, with the relation target when the trait is a pair.
 */
export function setChangedForInstance(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  target?: Entity
) {
  const eid = getEntityId(entity);
  const { generationId, bitflag } = data;
  const pageId = eid >>> 10;
  const offset = eid & 1023;

  if ((ctx.entityMasks[generationId][pageId][offset] & bitflag) === 0) return;

  for (const changedMask of ctx.changedMasks.values()) {
    ensureMaskPage(changedMask[generationId], pageId)[offset] |= bitflag;
  }

  const queries = data.changedQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'change', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  if (hasSubscribers(data.changeSubscriptions)) emit(data.changeSubscriptions, entity, target);
}

export function setChanged(ctx: WorldContext, entity: Entity, trait: Trait, target?: Entity) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data) setChangedForInstance(ctx, entity, data, target);
}
