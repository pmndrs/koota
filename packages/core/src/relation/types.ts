import { $internal } from '../common';

export type RelationTarget = number | string;

export type Relation<T> = T & {
	[$internal]: {
		pairsMap: Map<number | string, T>;
		createComponent: () => T;
		exclusive: boolean;
		autoRemoveTarget: boolean;
	};
} & ((target: RelationTarget) => T);
