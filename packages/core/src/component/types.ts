import { RelationTarget } from '../relation/types';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { $component, $entity, $world } from './symbols';

export type Component<TSchema extends Schema = any, TStore = Store<TSchema>> = {
	schema: TSchema;
	[$internal]: {
		set: (index: number, store: TStore, values: Partial<PropsFromSchema<TSchema>>) => void;
		fastSet: (index: number, store: TStore, values: Partial<PropsFromSchema<TSchema>>) => void;
		get: (index: number, store: TStore) => PropsFromSchema<TSchema>;
		stores: TStore[];
		id: number;
		createStore: () => TStore;
		isPairComponent: boolean;
		relation: any | null;
		pairTarget: RelationTarget | null;
		isTag: boolean;
	};
} & ((params: Partial<PropsFromSchema<TSchema>>) => [Component<TSchema, TStore>, Partial<TSchema>]);

export type ComponentWithParams<C extends Component = Component> = [
	C,
	C extends Component<infer S, any> ? Partial<PropsFromSchema<S>> : never
];

export type ComponentOrWithParams<C extends Component = Component> = C | ComponentWithParams<C>;

export type Schema = {
	[key: string]: number | string | boolean | any[] | object | null | undefined;
};

export type Normalized<T extends Schema> = {
	[K in keyof T]: T[K] extends boolean ? boolean : T[K];
};

export type Store<T extends Schema = any> = {
	[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]>[] : T[P][];
};

export type ComponentInstance<T extends Schema = any> = {
	[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P];
} & {
	[$component]: Component<T>;
	[$entity]: number | null;
	[$world]: World | null;
};

// Utils

export type PropsFromSchema<T extends Schema> = {
	[P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P];
};

export type SchemaFromComponent<T extends Component> = T extends Component<infer S, any> ? S : never;
export type StoreFromComponent<T extends Component> = T extends Component<any, infer S> ? S : never;

export type StoreFromComponents<T extends [Component, ...Component[]]> = T extends [infer C]
	? C extends Component<any, Store<any>>
		? StoreFromComponent<C>
		: never
	: { [K in keyof T]: StoreFromComponent<T[K]> };
