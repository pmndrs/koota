import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Trait } from '../trait/types';

export type RelationTarget = Entity | '*' | WildcardRelation;

export type Relation<T extends Trait> = {
	[$internal]: {
		pairsMap: Map<number | string | RelationTarget, T>;
		createTrait: () => T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => T);

declare const WILDCARD_RELATION_BRAND: unique symbol;

export type WildcardRelation = {
	[$internal]: {
		/** Used to differentiate between wildcard and normal relations on the type level */
		readonly [WILDCARD_RELATION_BRAND]: typeof WILDCARD_RELATION_BRAND;
		pairsMap: Map<number | string, Trait>;
		createTrait: () => Trait;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => Trait);
