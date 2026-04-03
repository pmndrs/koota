import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { registerTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait } from '../trait/types';
import type { WorldInternal } from '../world';
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

    return orderedTrait as unknown as OrderedRelation<T>;
}

export /* @inline @pure */ function isOrderedTrait(trait: Trait): trait is OrderedRelation {
    return $orderedTargetsTrait in trait;
}

export /* @inline @pure */ function getOrderedTraitRelation(trait: OrderedRelation): Relation {
    return trait[$orderedTargetsTrait].relation;
}

export function setupOrderedTraitSync(ctx: WorldInternal, orderedTrait: OrderedRelation): void {
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

    const getList = (parent: Entity): OrderedList | undefined => {
        const eid = getEntityId(parent);
        return entityMasks[generationId][eid >>> 10][eid & 1023] & bitflag
            ? (traitCtx.get(eid, store) as OrderedList)
            : undefined;
    };

    type RelationSub = (entity: Entity, target: Entity) => void;

    (relationInstance.addSubscriptions as Set<RelationSub>).add((child, parent) => {
        getList(parent)?._appendWithoutSync(child);
    });

    (relationInstance.removeSubscriptions as Set<RelationSub>).add((child, parent) => {
        const eid = getEntityId(parent);
        const denseIdx = entityIndex.sparse[eid];
        if (denseIdx !== undefined && getEntityId(entityIndex.dense[denseIdx]) === eid) {
            getList(parent)?._removeWithoutSync(child);
        }
    });
}
