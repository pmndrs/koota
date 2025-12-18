import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Trait } from '../trait/types';
import { $relation, $relationPair } from './symbols';

export type RelationTarget = Entity | '*';

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
