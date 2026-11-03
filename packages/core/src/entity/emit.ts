import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertRelationTarget } from '../asserts';
import { attachEventTarget } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { emit } from '../trait/subscriptions';
import { reconcileTrackingQueries, registerTrait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import { clearTombstoneHistory } from './entity';
import type { Entity } from './types';
import { allocateFreeEntity, renewFreeEntity } from './utils/entity-index';
import { canReleaseHead, pushHandle, shiftHandle } from './utils/handle-ring';
import { getEntityId } from './utils/pack-entity';
import {
  DESTROYED_WORD,
  EMPTY_MASK_PAGE,
  REMOVED_WORD,
  materializeMaskPage,
} from './utils/paged-mask';

/**
 * An event is an entity born dead. Emit writes its data, records its traits as removed and as held
 * at destroy, and tells the Removed readers, without the membership an alive entity enters and
 * leaves. Events keep their own ring, so only emits decide when an event id is reused.
 */
export function emitEvent(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = allocateEvent(ctx);
  const eid = getEntityId(entity);

  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];

    /* @cold */ if (isRelationPair(config)) {
      emitRelationPair(ctx, entity, config);
    } else {
      let trait: Trait;
      let params: Record<string, any> | undefined;

      if (Array.isArray(config)) {
        trait = config[0];
        params = config[1];
      } else {
        trait = config as Trait;
      }

      if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
      const instance = getTraitInstance(ctx.traitInstances, trait)!;
      const traitCtx = trait[$internal];
      if (traitCtx.validate?.(ctx, eid, params) === false) continue;
      traitCtx.add(ctx, eid, instance.store, params);
      markEventTrait(ctx, eid, instance);
      emit(instance.addSubscriptions, entity);
    }
  }

  notifyEventQueries(ctx, entity);
  pushHandle(ctx.events, entity, ++ctx.destroySerial);
  return entity;
}

/** The oldest event id is reused once it is past the window and every reader has consumed it. */
function allocateEvent(ctx: WorldContext): Entity {
  const ring = ctx.events;
  if (canReleaseHead(ring, ctx.retain, ctx.consumedSerial)) {
    const entity = shiftHandle(ring);
    clearTombstoneHistory(ctx, entity);
    return renewFreeEntity(ctx.entityIndex, entity);
  }
  return allocateFreeEntity(ctx.entityIndex);
}

function markEventTrait(ctx: WorldContext, eid: number, instance: TraitInstance) {
  const generation = ctx.entityMasks[instance.generationId];
  const pageId = eid >>> 10;
  let page = generation[pageId];
  if (page === EMPTY_MASK_PAGE) page = materializeMaskPage(generation, pageId);
  const slot = (eid & 1023) << 2;
  page[slot + REMOVED_WORD] |= instance.bitflag;
  page[slot + DESTROYED_WORD] |= instance.bitflag;
}

/** Tells the Removed readers once every trait and pair is in place, so their filters see all of it. */
function notifyEventQueries(ctx: WorldContext, entity: Entity) {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = ((eid & 1023) << 2) + DESTROYED_WORD;
  const entityMasks = ctx.entityMasks;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    const traitsByBit = ctx.traitsByBit[g];
    let word = page[slot];
    while (word !== 0) {
      const low = word & -word;
      const instance = traitsByBit[31 - Math.clz32(low)];
      if (instance.trackingQueries.length !== 0) {
        reconcileTrackingQueries(ctx, entity, instance, 'remove', g, low);
      }
      word &= ~low;
    }
  }
}

function emitRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
  const target = pair.target;
  if (assertsEnabled) assertRelationTarget(ctx, target);
  if (typeof target !== 'number') return;
  const instance = attachEventTarget(ctx, pair.relation, entity, target, pair.params);
  markEventTrait(ctx, getEntityId(entity), instance);
  emit(instance.addSubscriptions, entity, target);
}
