import { Trait, IsTag, SnapshotFromComponent, ExtractStore } from '../trait/types';
import { Entity } from '../entity/types';
import { ModifierData } from './modifier';

export type QueryModifier = (...components: Trait[]) => ModifierData;

export type QueryParameter = Trait | ReturnType<QueryModifier>;

export type QuerySubscriber = (entity: Entity) => void;

export type QueryResult<T extends QueryParameter[]> = readonly Entity[] & {
	updateEach: (
		callback: (state: SnapshotFromParameters<T>, entity: Entity, index: number) => void
	) => void;
	useStores: (
		callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
	) => void;
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

export type SnapshotFromParameters<T extends QueryParameter[]> = T extends [
	infer First,
	...infer Rest
]
	? [
			...(First extends Trait
				? IsTag<First> extends false
					? [SnapshotFromComponent<First>]
					: []
				: First extends ModifierData<any>
				? IsNotModifier<First> extends true
					? []
					: SnapshotFromParameters<UnwrapModifierData<First>>
				: []),
			...(Rest extends QueryParameter[] ? SnapshotFromParameters<Rest> : [])
	  ]
	: [];

export type IsNotModifier<T> = T extends ModifierData<any, infer TType>
	? TType extends 'not'
		? true
		: false
	: false;
