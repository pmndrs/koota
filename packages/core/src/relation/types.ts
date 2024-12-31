import { $internal } from '../common';
import { Trait } from '../trait/types';

export type RelationTarget = number | string;

export type Relation<T extends Trait> = {
	[$internal]: {
		pairsMap: Map<number | string, T>;
		createTrait: () => T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => T);
