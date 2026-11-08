import { assertsEnabled } from '../assert-config';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { EMPTY_MASK_PAGE, REMOVED_WORD, materializeMaskPage } from '../entity/utils/paged-mask';
import type { WorldContext } from '../world/types';
import type { TraitInstance } from './types';

/** Set membership and advance revisions without reconciling queries. */
/** @inline */
export function setTraitMembership(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const eid = getEntityId(entity);
  const generation = ctx.entityMasks[instance.generationId];
  let page = generation[eid >>> 10];
  if (page === EMPTY_MASK_PAGE) page = materializeMaskPage(generation, eid >>> 10);
  page[(eid & 1023) << 2] |= instance.bitflag;
  instance.version++;
  if (assertsEnabled) ctx.structuralRevision++;
}

/** Clear held membership and retain its removal without reconciling queries. */
/** @inline */
export function clearTraitMembership(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const eid = getEntityId(entity);
  const page = ctx.entityMasks[instance.generationId][eid >>> 10];
  const slot = (eid & 1023) << 2;
  page[slot] &= ~instance.bitflag;
  page[slot + REMOVED_WORD] |= instance.bitflag;
  instance.version++;
  if (assertsEnabled) ctx.structuralRevision++;
}
