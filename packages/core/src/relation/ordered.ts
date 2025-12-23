import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { trait, registerTrait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait } from '../trait/types';
import type { World } from '../world';
import { OrderedList } from './ordered-list';
import { $orderedTrait } from './symbols';
import type { Relation } from './types';

export interface OrderedTrait<T extends Trait = Trait> extends Trait<() => OrderedList> {
	[$orderedTrait]: {
		relation: Relation<T>;
	};
}

/**
 * Creates a trait that maintains an ordered list of entities related by a relation.
 * The list automatically syncs with the relation - adding/removing from the list
 * adds/removes the relation pair, and vice versa.
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
export function ordered<T extends Trait>(relation: Relation<T>): OrderedTrait<T> {
	const orderedTrait = trait(() => [] as Entity[]);

	Object.defineProperty(orderedTrait, $orderedTrait, {
		value: { relation },
		writable: false,
		enumerable: false,
		configurable: false,
	});

	return orderedTrait as unknown as OrderedTrait<T>;
}

/**
 * Check if a trait is an ordered trait.
 */
export /* @inline @pure */ function isOrderedTrait(trait: Trait): trait is OrderedTrait {
	return $orderedTrait in trait;
}

/**
 * Get the relation linked to an ordered trait.
 */
export /* @inline @pure */ function getOrderedTraitRelation(trait: OrderedTrait): Relation {
	return trait[$orderedTrait].relation;
}

/**
 * Setup sync subscriptions for an ordered trait.
 * Called during trait registration to wire up bidirectional sync.
 */
export function setupOrderedTraitSync(world: World, orderedTrait: OrderedTrait): void {
	const ctx = world[$internal];
	const relation = getOrderedTraitRelation(orderedTrait);
	const relationTrait = relation[$internal].trait;

	const orderedTraitInstance = getTraitInstance(ctx.traitInstances, orderedTrait);
	if (!orderedTraitInstance) return;

	let relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
	if (!relationTraitInstance) {
		registerTrait(world, relationTrait);
		relationTraitInstance = getTraitInstance(ctx.traitInstances, relationTrait);
		if (!relationTraitInstance) return;
	}

	const traitCtx = orderedTrait[$internal];
	const { generationId, bitflag, store } = orderedTraitInstance;
	const entityMasks = ctx.entityMasks;
	const entityIndex = ctx.entityIndex;

	const getList = (parent: Entity): OrderedList | undefined => {
		const eid = getEntityId(parent);
		if (!entityMasks[generationId] || !(entityMasks[generationId][eid] & bitflag)) {
			return undefined;
		}
		let list = traitCtx.get(eid, store);
		if (list && !(list instanceof OrderedList)) {
			list = new OrderedList(world, parent, relation, list);
			(store as any)[eid] = list;
		}
		return list instanceof OrderedList ? list : undefined;
	};

	relationTraitInstance.addSubscriptions.add(((child: Entity, parent: Entity) => {
		const list = getList(parent);
		if (list) list._appendWithoutSync(child);
	}) as any);

	relationTraitInstance.removeSubscriptions.add(((child: Entity, parent: Entity) => {
		const eid = getEntityId(parent);
		const denseIdx = entityIndex.sparse[eid];
		if (denseIdx === undefined || getEntityId(entityIndex.dense[denseIdx]) !== eid) return;

		const list = getList(parent);
		if (list) list._removeWithoutSync(child);
	}) as any);
}
