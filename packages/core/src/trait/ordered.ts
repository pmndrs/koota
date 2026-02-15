import { $internal, $orderedTargetsTrait } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import type { World } from '../world';
import { OrderedList } from './ordered-list';
import { trait, registerTrait } from './trait';
import { getTraitInstance } from './trait-instance';
import type { OrderedRelation, Relation, Trait } from './types';

/**
 * Creates a trait that maintains an ordered list of entities related by a relation.
 * The list automatically syncs with the relation - adding/removing from the list
 * adds/removes the relation pair, and vice versa.
 *
 * @experimental This API is experimental and may change in future versions.
 * Please provide feedback on GitHub or Discord.
 *
 * @example
 * ```ts
 * const ChildOf = relation();
 * const OrderedChildren = ordered(ChildOf);
 *
 * const parent = world.spawn(OrderedChildren);
 * const children = parent.get(OrderedChildren);
 * children.push(child1); // adds ChildOf(parent) to child1
 * children.splice(0, 1); // removes ChildOf(parent) from child1
 * ```
 */
export function ordered<T = any>(relation: Relation<T>): OrderedRelation<T> {
    const orderedTrait = trait(() => [] as Entity[]);

    Object.defineProperty(orderedTrait, $orderedTargetsTrait, {
        value: { relation },
        writable: false,
        enumerable: false,
        configurable: false,
    });

    return orderedTrait as unknown as OrderedRelation<T>;
}

/**
 * Check if a trait is an ordered trait.
 */
export /* @inline @pure */ function isOrderedTrait(trait: Trait): trait is OrderedRelation {
    return $orderedTargetsTrait in trait;
}

/**
 * Get the relation linked to an ordered trait.
 */
export /* @inline @pure */ function getOrderedTraitRelation(trait: OrderedRelation): Relation {
    return trait[$orderedTargetsTrait].relation;
}

/**
 * Setup sync subscriptions for an ordered trait.
 * Called during trait registration to wire up bidirectional sync.
 */
export function setupOrderedTraitSync(world: World, orderedTrait: OrderedRelation): void {
    const ctx = world[$internal];
    const relation = getOrderedTraitRelation(orderedTrait);

    const orderedInstance = getTraitInstance(ctx.traitInstances, orderedTrait as Trait);
    if (!orderedInstance) return;

    let relationInstance = getTraitInstance(ctx.traitInstances, relation);
    if (!relationInstance) {
        registerTrait(world, relation);
        relationInstance = getTraitInstance(ctx.traitInstances, relation)!;
    }

    const { generationId, bitflag, store } = orderedInstance;
    const { entityMasks, entityIndex } = ctx;
    const traitCtx = orderedTrait[$internal];

    const getList = (parent: Entity): OrderedList | undefined => {
        const eid = getEntityId(parent);
        return entityMasks[generationId]?.[eid] & bitflag
            ? (traitCtx.accessors.get(eid, store) as OrderedList)
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
