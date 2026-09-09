import { $internal, getTrait, hasEntity, subscribeTrait, type KernelContext } from '../../kernel';
import type { Entity } from '../entity/types';
import { trait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { OrderedList } from './ordered-list';
import { $orderedTargetsTrait } from './symbols';
import type { OrderedRelation, Relation } from './types';

export function ordered<T extends Trait>(relation: Relation<T>): OrderedRelation<T> {
  const orderedTrait = trait(() => [] as Entity[]);

  Object.defineProperty(orderedTrait, $orderedTargetsTrait, {
    value: { relation },
    writable: false,
    enumerable: false,
    configurable: false,
  });

  orderedTrait[$internal].initialize = (ctx, entity) =>
    new OrderedList(ctx, entity as Entity, relation, orderedTrait);
  orderedTrait[$internal].onRegister = (ctx) =>
    setupOrderedTraitSync(ctx, orderedTrait as unknown as OrderedRelation<T>);
  return orderedTrait as unknown as OrderedRelation<T>;
}

export /* @inline @pure */ function isOrderedTrait(trait: Trait): trait is OrderedRelation {
  return $orderedTargetsTrait in trait;
}

export /* @inline @pure */ function getOrderedTraitRelation(trait: OrderedRelation): Relation {
  return trait[$orderedTargetsTrait].relation;
}

export function setupOrderedTraitSync(ctx: KernelContext, orderedTrait: OrderedRelation): void {
  const relation = getOrderedTraitRelation(orderedTrait);
  const relationTrait = relation[$internal].trait;

  const getList = (parent: number): OrderedList | undefined =>
    getTrait(ctx, parent, orderedTrait) as OrderedList | undefined;

  subscribeTrait(ctx, relationTrait, 'add', (child, parent) => {
    getList(parent!)?._appendWithoutSync(child as Entity);
  });
  subscribeTrait(ctx, relationTrait, 'remove', (child, parent) => {
    if (hasEntity(ctx, parent!)) getList(parent!)?._removeWithoutSync(child as Entity);
  });
}
