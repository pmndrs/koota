import { $internal } from '../common';
import { Trait } from '../trait/types';

export type RelationTarget = number | string | WildcardRelation;

export type Relation<T extends Trait> = {
	[$internal]: {
		pairsMap: Map<number | string, T>;
		createTrait: () => T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => T);

export type WildcardRelation = {
	[$internal]: {
		/** Used to differentiate between wildcard and normal relations on the type level */
		wildcard: true;
		pairsMap: Map<number | string, Trait>;
		createTrait: () => Trait;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => Trait);
