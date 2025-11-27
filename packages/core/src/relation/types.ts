import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Trait } from '../trait/types';

export type RelationTarget = Entity | '*' | WildcardRelation;

/** Internal store structure for relation targets */
export interface RelationStore {
	/** For exclusive: targets[entityId] = targetEntityId (0 = no target) */
	/** For non-exclusive: targets[entityId] = array of targetEntityIds */
	targets: number[] | number[][];
	/** For data-bearing relations: data[entityId][targetIdx] = user data */
	data: unknown[][] | null;
}

/** A pair represents a relation + target combination */
export interface RelationPair<T extends Trait = Trait> {
	[$internal]: {
		relation: Relation<T>;
		target: RelationTarget;
		isWildcard: boolean;
		params?: Record<string, unknown>;
	};
}

export type Relation<T extends Trait = Trait> = {
	[$internal]: {
		trait: T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
		/** Reverse index: targetEntityId -> Set of subject entityIds */
		targetIndex: Set<number>[];
	};
} & ((target: RelationTarget, params?: Record<string, unknown>) => RelationPair<T>);

declare const WILDCARD_RELATION_BRAND: unique symbol;

export type WildcardRelation = {
	[$internal]: {
		readonly [WILDCARD_RELATION_BRAND]: typeof WILDCARD_RELATION_BRAND;
		/** Reverse index: targetEntityId -> Set of subject entityIds */
		targetIndex: Set<number>[];
	};
} & ((target: RelationTarget) => RelationPair<Trait>);
