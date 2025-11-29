import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Trait } from '../trait/types';

export type RelationTarget = Entity | '*';

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
		params?: Record<string, unknown>;
	};
}

export type Relation<T extends Trait = Trait> = {
	[$internal]: {
		trait: T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget, params?: Record<string, unknown>) => RelationPair<T>);
