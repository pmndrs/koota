import { $autoRemoveTarget, $createComponent, $exclusiveRelation, $pairsMap } from './symbols';

export type RelationTarget = number | string;

export type Relation<T> = T & {
	[$pairsMap]: Map<number | string, T>;
	[$createComponent]: () => T;
	[$exclusiveRelation]: boolean;
	[$autoRemoveTarget]: boolean;
} & ((target: RelationTarget) => T);
