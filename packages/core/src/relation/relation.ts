import { $internal } from '../common';
import { Entity } from '../entity/types';
import { trait } from '../trait/trait';
import type { Schema, Trait } from '../trait/types';
import type { World } from '../world/world';
import type { Relation, RelationTarget, WildcardRelation } from './types';

function defineRelation<S extends Schema = Schema>(definition?: {
	exclusive?: boolean;
	autoRemoveTarget?: boolean;
	store?: S;
}): Relation<Trait<S>> {
	const pairsMap = new Map<number | string | RelationTarget, Trait<S>>();
	const traitFactory = () => trait(definition?.store ?? {}) as unknown as Trait<S>;

	function relationFn(target: RelationTarget) {
		if (target === undefined) throw Error('Relation target is undefined');
		if (target === '*') target = Wildcard as RelationTarget;
		return getRelationTrait<Trait<S>>(
			relationFn as Relation<Trait<S>>,
			traitFactory,
			pairsMap,
			target
		);
	}

	return Object.assign(relationFn, {
		[$internal]: {
			pairsMap,
			createTrait: traitFactory,
			exclusive: definition?.exclusive ?? false,
			autoRemoveTarget: definition?.autoRemoveTarget ?? false,
		},
	}) as Relation<Trait<S>>;
}
export const relation = defineRelation;

export function getRelationTrait<T extends Trait>(
	relation: Relation<T>,
	traitFactory: () => T,
	pairsMap: Map<number | string | RelationTarget, T>,
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

export const getRelationTargets = (
	world: World,
	relation: Relation<Trait>,
	entity: number
): readonly RelationTarget[] => {
	const ctx = world[$internal];
	const traits = ctx.entityTraits.get(entity);
	const targets: RelationTarget[] = [];

	if (!traits) return targets;

	for (const trait of traits) {
		const traitCtx = trait[$internal];
		if (traitCtx.relation === relation && traitCtx.pairTarget !== Wildcard) {
			targets.push(traitCtx.pairTarget!);
		}
	}

	return targets;
};

export const hasRelationToTarget = (
	world: World,
	entity: Entity,
	target: RelationTarget
): boolean => {
	const ctx = world[$internal];
	const traits = ctx.entityTraits.get(entity);
	if (!traits) return false;

	for (const trait of traits) {
		const traitCtx = trait[$internal];
		if (
			traitCtx.isPairTrait &&
			traitCtx.pairTarget === target &&
			traitCtx.relation !== Wildcard
		) {
			return true;
		}
	}
	return false;
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

export const Wildcard = defineRelation() as WildcardRelation;
