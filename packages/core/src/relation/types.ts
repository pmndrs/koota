import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Trait } from '../trait/types';

export type RelationTarget = Entity | '*';

export const $relationPair = Symbol('relationPair');
export const $relation = Symbol('relation');

/** A pair represents a relation + target combination */
export interface RelationPair<T extends Trait = Trait> {
	readonly [$relationPair]: true;
	[$internal]: {
		relation: Relation<T>;
		target: RelationTarget;
		params?: Record<string, unknown>;
	};
}

export type Relation<T extends Trait = Trait> = {
	readonly [$relation]: true;
	[$internal]: {
		trait: T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget, params?: Record<string, unknown>) => RelationPair<T>);
