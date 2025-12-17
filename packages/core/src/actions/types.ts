import type { World } from '../world';

export type Actions = Record<never, (...args: any[]) => void>;

export type ActionInitializer<
	T extends Actions,
	C extends Record<string, unknown> | undefined = undefined
> = (world: World, context: C) => T;

export type ActionGetter<
	T extends Actions,
	C extends Record<string, unknown> | undefined = undefined
> = C extends undefined ? (world: World) => T : (world: World, context: C) => T;
