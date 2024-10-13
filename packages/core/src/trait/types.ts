import { Relation, RelationTarget } from '../relation/types';
import { $internal } from '../common';
import { IsEmpty } from '../utils/types';

export type Trait<
	TSchema extends Schema = any,
	TStore = Store<TSchema>,
	TTag extends boolean = IsEmpty<TSchema>
> = {
	schema: TSchema;
	[$internal]: {
		set: (
			index: number,
			store: TStore,
			values: Partial<TraitInstanceFromSchema<TSchema>>
		) => void;
		fastSet: (
			index: number,
			store: TStore,
			values: Partial<TraitInstanceFromSchema<TSchema>>
		) => void;
		fastSetWithChangeDetection: (
			index: number,
			store: TStore,
			values: Partial<TraitInstanceFromSchema<TSchema>>
		) => boolean;
		get: (index: number, store: TStore) => TraitInstanceFromSchema<TSchema>;
		stores: TStore[];
		id: number;
		createStore: () => TStore;
		isPairTrait: boolean;
		relation: Relation<any> | null;
		pairTarget: RelationTarget | null;
		isTag: TTag;
	};
} & ((
	params: Partial<TraitInstanceFromSchema<TSchema>>
) => [Trait<TSchema, TStore>, Partial<TSchema>]);

export type TraitTuple<T extends Trait = Trait> = [
	T,
	T extends Trait<infer S, any> ? Partial<TraitInstanceFromSchema<S>> : never
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T>;

export type TraitInstanceFromSchema<T extends Schema> = {
	[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P];
};

export type TraitInstance<T extends Trait> = {
	[P in keyof T['schema']]: T['schema'][P] extends (...args: any[]) => any
		? ReturnType<T['schema'][P]>
		: T['schema'][P];
};

export type Schema = {
	[key: string]: number | string | boolean | any[] | object | null | undefined;
};

export type Store<T extends Schema = any> = {
	[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]>[] : T[P][];
};

// Utils

export type Norm<T extends Schema> = {
	[K in keyof T]: T[K] extends boolean ? boolean : T[K];
};

export type TraitSnapshot<T extends Trait> = T extends Trait<infer S, any>
	? TraitInstanceFromSchema<S>
	: never;
export type ExtractSchema<T extends Trait> = T extends Trait<infer S, any> ? S : never;
export type ExtractStore<T extends Trait> = T extends Trait<any, infer S> ? S : never;

export type ExtractStores<T extends [Trait, ...Trait[]]> = T extends [infer C]
	? C extends Trait<any, Store<any>>
		? ExtractStore<C>
		: never
	: { [K in keyof T]: ExtractStore<T[K]> };

export type IsTag<T extends Trait> = T extends Trait<any, any, infer Tag> ? Tag : false;
