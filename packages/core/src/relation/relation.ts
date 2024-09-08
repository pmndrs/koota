import { define } from '../component/component';
import { $isPairComponent, $pairTarget, $relation } from '../component/symbols';
import { Component, Schema } from '../component/types';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { $autoRemoveTarget, $createComponent, $exclusiveRelation, $pairsMap } from './symbols';
import { Relation, RelationTarget } from './types';

function defineRelation<
	T extends Schema = any,
	C extends Component = Component<Schema>
>(definition?: { exclusive?: boolean; autoRemoveTarget?: boolean; store?: T }): Relation<C> {
	const pairsMap = new Map<any, C>();
	const componentFactory = () => define(definition?.store ?? {}) as C;

	function relationFn(target: RelationTarget) {
		if (target === undefined) throw Error('Relation target is undefined');
		if (target === '*') target = Wildcard;
		return getRelationComponent<C>(relationFn, componentFactory, pairsMap, target);
	}

	return Object.assign(relationFn, {
		[$exclusiveRelation]: definition?.exclusive ?? false,
		[$createComponent]: componentFactory,
		[$pairsMap]: pairsMap,
		[$autoRemoveTarget]: definition?.autoRemoveTarget ?? false,
	}) as Relation<C>;
}
export const relation = defineRelation;

export function getRelationComponent<T extends Component>(
	relation: (target: RelationTarget) => T,
	componentFactory: () => T,
	pairsMap: Map<any, T>,
	target: RelationTarget
) {
	if (!pairsMap.has(target)) {
		const component = componentFactory();

		component[$isPairComponent] = true;
		component[$relation] = relation;
		component[$pairTarget] = target;

		pairsMap.set(target, component);
	}

	return pairsMap.get(target)!;
}

export const getRelationTargets = (world: World, relation: Relation<any>, entity: number) => {
	const ctx = world[$internal];
	const components = ctx.entityComponents.get(entity) || [];
	const targets: RelationTarget[] = [];

	for (const component of components) {
		if (component[$relation] === relation && component[$pairTarget] !== Wildcard) {
			targets.push(component[$pairTarget]!);
		}
	}

	return targets as readonly RelationTarget[];
};

export const Pair = <T extends Component>(relation: Relation<T>, target: RelationTarget): T => {
	if (relation === undefined) throw Error('Relation is undefined');
	if (target === undefined) throw Error('Relation target is undefined');
	if (target === '*') target = Wildcard;

	const pairsMap = relation[$pairsMap];
	const componentFactory = relation[$createComponent];

	return getRelationComponent<T>(relation, componentFactory, pairsMap, target);
};

export const Wildcard: Relation<any> | string = defineRelation();
