import { trait } from '../trait/trait';
import { Trait, Schema } from '../trait/types';
import { $internal } from '../common';
import { World } from '../world/world';
import { Relation, RelationTarget } from './types';

function defineRelation<S extends Schema = any, T extends Trait = Trait<Schema>>(definition?: {
	exclusive?: boolean;
	autoRemoveTarget?: boolean;
	store?: S;
}): Relation<T> {
	const pairsMap = new Map<any, T>();
	const traitFactory = () => trait(definition?.store ?? {}) as T;

	function relationFn(target: RelationTarget) {
		if (target === undefined) throw Error('Relation target is undefined');
		if (target === '*') target = Wildcard;
		return getRelationTrait<T>(relationFn, traitFactory, pairsMap, target);
	}

	return Object.assign(relationFn, {
		[$internal]: {
			pairsMap,
			createTrait: traitFactory,
			exclusive: definition?.exclusive ?? false,
			autoRemoveTarget: definition?.autoRemoveTarget ?? false,
		},
	}) as Relation<T>;
}
export const relation = defineRelation;

export function getRelationTrait<T extends Trait>(
	relation: (target: RelationTarget) => T,
	traitFactory: () => T,
	pairsMap: Map<any, T>,
	target: RelationTarget
) {
	if (!pairsMap.has(target)) {
		const trait = traitFactory();
		const tratCtx = trait[$internal];

		tratCtx.isPairTrait = true;
		tratCtx.relation = relation;
		tratCtx.pairTarget = target;

		pairsMap.set(target, trait);
	}

	return pairsMap.get(target)!;
}

export const getRelationTargets = (world: World, relation: Relation<any>, entity: number) => {
	const ctx = world[$internal];
	const traits = ctx.entityTraits.get(entity) || [];
	const targets: RelationTarget[] = [];

	for (const trait of traits) {
		const traitCtx = trait[$internal];
		if (traitCtx.relation === relation && traitCtx.pairTarget !== Wildcard) {
			targets.push(traitCtx.pairTarget!);
		}
	}

	return targets as readonly RelationTarget[];
};

export const Pair = <T extends Trait>(relation: Relation<T>, target: RelationTarget): T => {
	if (relation === undefined) throw Error('Relation is undefined');
	if (target === undefined) throw Error('Relation target is undefined');
	if (target === '*') target = Wildcard;

	const ctx = relation[$internal];
	const pairsMap = ctx.pairsMap;
	const traitFactory = ctx.createTrait;

	return getRelationTrait<T>(relation, traitFactory, pairsMap, target);
};

export const Wildcard: Relation<any> | string = defineRelation();
