import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertRelationTarget } from '../asserts';
import { attachEventTarget } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { emit } from '../trait/subscriptions';
import { registerTrait } from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { WorldContext } from '../world';
import { clearTombstoneHistory } from './entity';
import { attachSubject, markEventTrait } from './subject';
import type { Entity } from './types';
import { allocateFreeEntity, renewFreeEntity } from './utils/entity-index';
import { pushHandle, shiftHandle } from './utils/handle-ring';
import { getEntityId } from './utils/pack-entity';

/**
 * An event is an entity born dead about a subject. Emit writes its data, records its traits as
 * removed and as held at destroy and attaches the subject pair, without the membership an alive
 * entity enters and leaves. Listeners read the event ring on their own runs, so an emit tells
 * nobody. Events keep their own ring, so only emits decide when an event id is reused.
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
  pushHandle(ctx.events, entity, ++ctx.destroySerial);
  return entity;
}

/**
 * The oldest event id is reused once every listener has consumed it and 64 newer events exist,
 * or once 16384 are waiting on a listener that stopped running. The window is small and apart
 * from retain, so the live events of a world stay within one page unless a burst outgrows it.
 */
function allocateEvent(ctx: WorldContext): Entity {
  const ring = ctx.events;
  const count = ring.count;
  if (count > 64 && (ring.serials[ring.head] <= ctx.consumedEventSerial || count >= 16384)) {
    const entity = shiftHandle(ring);
    clearTombstoneHistory(ctx, entity);
    return renewFreeEntity(ctx.entityIndex, entity);
  }
  return allocateFreeEntity(ctx.entityIndex);
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
