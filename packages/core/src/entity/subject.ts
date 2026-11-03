import { assertsEnabled } from '../assert-config';
import { assertEntityReadable } from '../asserts';
import { emit } from '../trait/subscriptions';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import type { Entity } from './types';
import { getEntityId } from './utils/pack-entity';
import {
  DESTROYED_WORD,
  EMPTY_MASK_PAGE,
  REMOVED_WORD,
  materializeMaskPage,
} from './utils/paged-mask';

/** Records a trait as removed and as held at death, the history an event row carries. */
export function markEventTrait(ctx: WorldContext, eid: number, instance: TraitInstance) {
  const generation = ctx.entityMasks[instance.generationId];
  const pageId = eid >>> 10;
  let page = generation[pageId];
  if (page === EMPTY_MASK_PAGE) page = materializeMaskPage(generation, pageId);
  const slot = (eid & 1023) << 2;
  page[slot + REMOVED_WORD] |= instance.bitflag;
  page[slot + DESTROYED_WORD] |= instance.bitflag;
}

/**
 * Attaches the subject pair to an event row. The forward entry is written the way a tombstone
 * keeps one, with no reverse index, since nothing reconciles or cascades through it.
 */
export /* @inline */ function attachSubject(ctx: WorldContext, entity: Entity, subject: Entity) {
  if (assertsEnabled) assertEntityReadable(ctx, subject);
  const instance = ctx.subject;
  const eid = getEntityId(entity);
  const targets = (instance.relationTargets ??= []);
  const page = (targets[eid >>> 10] ??= []);
  page[eid & 1023] = subject;
  markEventTrait(ctx, eid, instance);
  emit(instance.addSubscriptions, entity, subject);
}
