import { Entity } from '../entity/types';
import { AoSFactory, ExtractSchema, ExtractStore, IsTag, Trait, TraitInstance } from '../trait/types';
import { ModifierData } from './modifier';

export type QueryModifier = (...components: Trait[]) => ModifierData;
export type QueryParameter = Trait | ReturnType<QueryModifier>;
export type QuerySubscriber = (entity: Entity) => void;

export type QueryResultOptions = {
	changeDetection?: boolean;
};

export type QueryResult<T extends QueryParameter[] = QueryParameter[]> = readonly Entity[] & {
	updateEach: (
		callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
		options?: QueryResultOptions
	) => QueryResult<T>;
	useStores: (
		callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
	) => QueryResult<T>;
	select<U extends QueryParameter[]>(...params: U): QueryResult<U>;
};

type UnwrapModifierData<T> = T extends ModifierData<infer C> ? C : never;

export type StoresFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest]
	? [
			...(First extends Trait
				? [ExtractStore<First>]
				: First extends ModifierData<any>
				? StoresFromParameters<UnwrapModifierData<First>>
				: []),
			...(Rest extends QueryParameter[] ? StoresFromParameters<Rest> : [])
	  ]
	: [];

export type InstancesFromParameters<T extends QueryParameter[]> = T extends [
	infer First,
	...infer Rest
]
	? [
			...(First extends Trait
				? IsTag<First> extends false
					? ExtractSchema<First> extends AoSFactory
						? [ReturnType<ExtractSchema<First>>]
						: [TraitInstance<First>]
					: []
				: First extends ModifierData<any>
				? IsNotModifier<First> extends true
					? []
					: InstancesFromParameters<UnwrapModifierData<First>>
				: []),
			...(Rest extends QueryParameter[] ? InstancesFromParameters<Rest> : [])
	  ]
	: [];

export type IsNotModifier<T> = T extends ModifierData<any, infer TType>
	? TType extends 'not'
		? true
		: false
	: false;
