import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertRelationTarget } from '../asserts';
import { attachEventTarget } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { emit } from '../trait/subscriptions';
import { reconcileTrackingQueries, registerTrait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { WorldContext } from '../world';
import { clearTombstoneHistory } from './entity';
import { attachSubject, markEventTrait } from './subject';
import type { Entity } from './types';
import { allocateFreeEntity, renewFreeEntity } from './utils/entity-index';
import { canReleaseHead, pushHandle, shiftHandle } from './utils/handle-ring';
import { getEntityId } from './utils/pack-entity';
import { DESTROYED_WORD, EMPTY_MASK_PAGE } from './utils/paged-mask';

/**
 * An event is an entity born dead about a subject. Emit writes its data, records its traits as
 * removed and as held at destroy, attaches the subject pair and tells the Removed readers,
 * without the membership an alive entity enters and leaves. Events keep their own ring, so only
 * emits decide when an event id is reused.
 */
export function emitEvent(ctx: WorldContext, traits: ConfigurableTrait[], subject: Entity): Entity {
  if (ctx.retain === 0) {
    throw new Error(
      'Koota: [EMIT_RETAIN] Events need a world that keeps destroyed entities. Create it without retain: 0.'
    );
  }
  const entity = allocateEvent(ctx);
  const eid = getEntityId(entity);
  let hasSubject = false;

  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];

    if (isRelationPair(config)) {
      if (emitRelationPair(ctx, entity, config)) hasSubject = true;
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

  if (!hasSubject) attachSubject(ctx, entity, subject);
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

/**
 * Tells the Removed readers once every trait and pair is in place, so their filters see all of it.
 * The subject bit is a static term of every listener, read while their own trait reconciles, so
 * it reconciles nothing on its own.
 */
function notifyEventQueries(ctx: WorldContext, entity: Entity) {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = ((eid & 1023) << 2) + DESTROYED_WORD;
  const entityMasks = ctx.entityMasks;
  const subject = ctx.subject;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    const traitsByBit = ctx.traitsByBit[g];
    let word = page[slot];
    if (g === subject.generationId) word &= ~subject.bitflag;
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

/** Writes a pair on the event. Returns whether the pair names the subject. */
function emitRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair): boolean {
  const target = pair.target;
  if (assertsEnabled) assertRelationTarget(ctx, target);
  if (typeof target !== 'number') return false;
  const relation = pair.relation;
  const instance = attachEventTarget(ctx, relation, entity, target, pair.params);
  markEventTrait(ctx, getEntityId(entity), instance);
  emit(instance.addSubscriptions, entity, target);
  return relation[$internal].reserved;
}
