import { Relation, RelationTarget } from '../relation/types';
import { $internal } from '../common';
import { IsEmpty } from '../utils/types';

export type TraitType = 'atomic' | 'schematic';

export type Trait<
	TSchema extends Schema = any,
	TStore = Store<TSchema>,
	TTag extends boolean = IsEmpty<TSchema>,
	TType extends TraitType = TSchema extends AtomicFactory ? 'atomic' : 'schematic'
> = {
	schema: TSchema;
	[$internal]: {
		set: TSchema extends AtomicFactory
			? (index: number, store: any, value: ReturnType<TSchema>) => void
			: (index: number, store: any, value: Partial<TraitInstance<TSchema>>) => void;
		fastSet: TSchema extends AtomicFactory
			? (index: number, store: any, value: ReturnType<TSchema>) => void
			: (index: number, store: any, value: Partial<TraitInstance<TSchema>>) => void;
		fastSetWithChangeDetection: TSchema extends AtomicFactory
			? (index: number, store: any, value: ReturnType<TSchema>) => boolean
			: (index: number, store: any, value: Partial<TraitInstance<TSchema>>) => boolean;
		get: TSchema extends AtomicFactory
			? (index: number, store: any) => ReturnType<TSchema>
			: (index: number, store: any) => TraitInstance<TSchema>;
		stores: TStore[];
		id: number;
		createStore: () => TStore;
		isPairTrait: boolean;
		relation: Relation<any> | null;
		pairTarget: RelationTarget | null;
		isTag: TTag;
		type: TType;
	};
} & (TSchema extends AtomicFactory
	? (params?: ReturnType<TSchema>) => [Trait<TSchema, TStore, TTag, TType>, ReturnType<TSchema>]
	: (
			params: Partial<TraitInstance<TSchema>>
	  ) => [Trait<TSchema, TStore, TTag, TType>, Partial<TSchema>]);

export type TraitTuple<T extends Trait = Trait> = [
	T,
	T extends Trait<infer S, any>
		? S extends AtomicFactory
			? ReturnType<S>
			: Partial<TraitInstance<S>>
		: never
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T>;

export type TraitInstance<T extends Trait | Schema> = T extends Trait
	? T['schema'] extends AtomicFactory
		? ReturnType<T['schema']>
		: {
				[P in keyof T['schema']]: T['schema'][P] extends (...args: any[]) => any
					? ReturnType<T['schema'][P]>
					: T['schema'][P];
		  }
	: T extends AtomicFactory
	? ReturnType<T>
	: {
			[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P];
	  };

export type Schema =
	| {
			[key: string]: number | string | boolean | any[] | object | null | undefined;
	  }
	| AtomicFactory;

export type AtomicFactory = () => Record<string, any>;

export type Store<T extends Schema = any> = T extends AtomicFactory
	? ReturnType<T>[]
	: {
			[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]>[] : T[P][];
	  };

// Utils

export type Norm<T extends Schema> = T extends AtomicFactory
	? () => ReturnType<T> extends number
			? number
			: ReturnType<T> extends boolean
			? boolean
			: ReturnType<T> extends string
			? string
			: ReturnType<T>
	: {
			[K in keyof T]: T[K] extends boolean ? boolean : T[K];
	  };

export type ExtractSchema<T extends Trait> = T extends Trait<infer S, any> ? S : never;
export type ExtractStore<T extends Trait> = T extends Trait<any, infer S> ? S : never;
export type ExtractIsTag<T extends Trait> = T extends Trait<any, any, infer Tag> ? Tag : false;
export type ExtractTraitType<T extends Trait> = T extends Trait<any, any, any, infer Type>
	? Type
	: never;

export type ExtractStores<T extends [Trait, ...Trait[]]> = T extends [infer C]
	? C extends Trait<any, Store<any>>
		? ExtractStore<C>
		: never
	: { [K in keyof T]: ExtractStore<T[K]> };

export type IsTag<T extends Trait> = T extends Trait<any, any, infer Tag> ? Tag : false;
