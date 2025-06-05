import { $internal } from '../common';
import type { Relation, RelationTarget } from '../relation/types';
import type { IsEmpty } from '../utils/types';

export type TraitType = 'aos' | 'soa';

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
	? ReturnType<TSchema>
	: Partial<TraitInstance<TSchema>>;

export type Trait<
	TSchema extends Schema = any,
	TStore = Store<TSchema>,
	TTag extends boolean = IsEmpty<TSchema>,
> = {
	schema: TSchema;
	[$internal]: {
		set: (index: number, store: any, value: TraitValue<TSchema>) => void;
		fastSet: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
		fastSetWithChangeDetection: (
			index: number,
			store: any,
			value: TraitValue<TSchema>
		) => boolean;
		get: (index: number, store: any) => TraitInstance<TSchema>;
		stores: TStore[];
		id: number;
		createStore: () => TStore;
		isPairTrait: boolean;
		relation: Relation<any> | null;
		pairTarget: RelationTarget | null;
		isTag: TTag;
		type: TraitType;
	};
} & ((params?: TraitValue<TSchema>) => [Trait<TSchema, TStore, TTag>, TraitValue<TSchema>]);

export type TraitTuple<T extends Trait = Trait> = [
	T,
	T extends Trait<infer S, any>
		? S extends AoSFactory
			? ReturnType<S>
			: Partial<TraitInstance<S>>
		: never,
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T>;

type TraitInstanceFromTrait<T extends Trait> = T['schema'] extends AoSFactory
	? ReturnType<T['schema']>
	: {
			[P in keyof T['schema']]: T['schema'][P] extends (...args: any[]) => any
				? ReturnType<T['schema'][P]>
				: T['schema'][P];
		};

type TraitInstanceFromSchema<T extends Schema> = T extends AoSFactory
	? ReturnType<T>
	: {
			[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P];
		};

export type TraitInstance<T extends Trait | Schema> = T extends Trait
	? TraitInstanceFromTrait<T>
	: TraitInstanceFromSchema<T>;

export type Schema =
	| {
			[key: string]: number | string | boolean | any[] | object | null | undefined;
	  }
	| AoSFactory;

export type AoSFactory = () => Record<string, any>;

export type Store<T extends Schema = any> = T extends AoSFactory
	? ReturnType<T>[]
	: {
			[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]>[] : T[P][];
		};

// Type Utils

// This type utility ensures that explicit values like true, false or "string literal" are normalized to their primitive types.
// Mostly used for schema types.
export type Norm<T extends Schema> = T extends AoSFactory
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

export type ExtractSchema<T extends Trait | Relation<Trait>> = T extends Relation<infer R>
	? ExtractSchema<R>
	: T extends Trait<infer S>
		? S
		: never;
export type ExtractStore<T extends Trait> = T extends Trait<any, infer S> ? S : never;
export type ExtractIsTag<T extends Trait> = T extends Trait<any, any, infer Tag> ? Tag : false;

export type IsTag<T extends Trait> = T extends Trait<any, any, infer Tag> ? Tag : false;
