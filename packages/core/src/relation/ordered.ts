import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { createTraitContext, defineTraitProperties, registerTrait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import { subscribeAll } from '../trait/subscriptions';
import type { Trait, TraitValue } from '../trait/types';
import type { MutableOrderedView } from '../view/types';
import { getEntitiesWithRelationTo } from './relation';
import type { WorldContext } from '../world';
import { RelationView } from './ordered-view';
import { $orderedTargetsTrait } from './symbols';
import type { OrderedRelation, Relation, RelationPair } from './types';

export function ordered<T extends Trait>(relation: Relation<T>): OrderedRelation<T> {
  const schema = (): MutableOrderedView<[]> => {
    throw new Error('Koota: Add an ordered trait to an entity to create its view.');
  };
  const context = createTraitContext(schema, (defaults) => ({
    // Each entity gets a list bound to itself, so the default is built per add.
    add: (ctx, index, store, value) => {
      const entity = ctx.entityIndex.dense[ctx.entityIndex.sparse[index]];
      if (value !== undefined) throw new Error('Koota: Ordered traits create their own views.');
      const existing = getEntitiesWithRelationTo(ctx, relation, entity);
      const entities = existing.length === 0 ? [] : (existing as Entity[]);
      defaults.add(
        ctx,
        index,
        store,
        new RelationView(ctx, entity, relation, orderedTrait, entities)
      );
    },
    set: (ctx, index, store, value) => {
      if (value !== defaults.get(ctx, index, store)) {
        throw new Error('Koota: Mutate the ordered view instead of replacing it.');
      }
      return false;
    },
    remove: (ctx, index, store) => {
      (defaults.get(ctx, index, store) as RelationView).active = false;
    },
  }));

  const orderedTrait = Object.assign((params?: TraitValue<any>) => [orderedTrait, params], {
    [$internal]: context,
  }) as unknown as OrderedRelation<T>;

  defineTraitProperties(orderedTrait, context, schema);

  Object.defineProperty(orderedTrait, $orderedTargetsTrait, {
    value: { relation },
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return orderedTrait;
}

export /* @inline @pure */ function isOrderedTrait(
  trait: Trait | RelationPair
): trait is OrderedRelation {
  return $orderedTargetsTrait in trait;
}

export /* @inline @pure */ function getOrderedTraitRelation(trait: OrderedRelation): Relation {
  return trait[$orderedTargetsTrait].relation;
}

export function setupOrderedTraitSync(ctx: WorldContext, orderedTrait: OrderedRelation): void {
  const relation = getOrderedTraitRelation(orderedTrait);
  const relationTrait = relation[$internal].trait;

  const orderedInstance = getTraitInstance(ctx.traitInstances, orderedTrait);
  if (!orderedInstance) return;

  let relationInstance = getTraitInstance(ctx.traitInstances, relationTrait);
  if (!relationInstance) {
    registerTrait(ctx, relationTrait);
    relationInstance = getTraitInstance(ctx.traitInstances, relationTrait)!;
  }

  const { generationId, bitflag, store } = orderedInstance;
  const { entityMasks, entityIndex } = ctx;
  const traitCtx = orderedTrait[$internal];

  const getList = (parent: Entity): RelationView | undefined => {
    const eid = getEntityId(parent);
    return entityMasks[generationId][eid >>> 10][(eid & 1023) << 2] & bitflag
      ? (traitCtx.get(ctx, eid, store) as RelationView)
      : undefined;
  };

  type RelationSub = (entity: Entity, target: Entity) => void;

  subscribeAll(relationInstance.addSubscriptions, ((child, parent) => {
    getList(parent)?.appendFromRelation(child);
  }) as RelationSub);

  subscribeAll(relationInstance.removeSubscriptions, ((child, parent) => {
    const eid = getEntityId(parent);
    const denseIdx = entityIndex.sparse[eid];
    if (denseIdx !== undefined && getEntityId(entityIndex.dense[denseIdx]) === eid) {
      getList(parent)?.removeFromRelation(child);
    }
  }) as RelationSub);
}
