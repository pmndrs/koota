import { $internal } from '../../common';
import { assertsEnabled } from '../../assert-config';
import { assertEntityAlive, assertTraitPresent } from '../../asserts';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { isRelation } from '../../relation/utils/is-relation';
import { emit } from '../../trait/subscriptions';
import { getTraitInstance } from '../../trait/trait-instance';
import type { ExtractTraits, Trait, TraitInstance, TraitOrRelation } from '../../trait/types';
import type { WorldContext } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';
import { markTraitChanged } from '../utils/mark-tracked-trait-changed';

export function createChanged() {
  const id = createTrackingId();

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `changed-${number}`> => {
    const traits = inputs.map((input) =>
      isRelation(input) ? input[$internal].trait : input
    ) as ExtractTraits<T>;
    // Naming a trait here is what starts its write history, so module scope terms track from the start.
    for (let i = 0; i < traits.length; i++) traits[i][$internal].tracked = true;
    return createModifier(`changed-${id}`, id, traits);
  };
}

/** @inline */
function markChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return;
  const index = getEntityId(entity);
  if ((ctx.entityMasks[data.generationId][index >>> 10][(index & 1023) << 2] & data.bitflag) === 0)
    return;
  markTraitChanged(ctx, entity, data);
  return data;
}

export function setChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }
  // An explicit flag is a request to be seen, so it opts the trait into write history.
  const data = markChanged(ctx, entity, trait);
  if (!data) {
    if (assertsEnabled) {
      assertTraitPresent(ctx, entity, trait);
    }
    return;
  }
  emit(data.changeSubscriptions, entity);
}

/** Notify after a validated write. A removed trait has no change to publish. */
export function notifyChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = markChanged(ctx, entity, trait);
  if (data) emit(data.changeSubscriptions, entity);
}

/** The caller must validate membership and finish the write without reentering the core. */
export /* @inline */ function notifyTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  markTraitChanged(ctx, entity, data);
  emit(data.changeSubscriptions, entity);
}

export function setPairChanged(ctx: WorldContext, entity: Entity, trait: Trait, target: Entity) {
  const data = markChanged(ctx, entity, trait);
  if (data) emit(data.changeSubscriptions, entity, target);
}
