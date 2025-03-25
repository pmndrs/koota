import { World } from '../world/world';

export type Actions = Record<string, (...args: any[]) => void>;
export type ActionInitializer<T extends Actions, C extends Record<string, unknown> = never> = (
	world: World,
	context: C
) => T;
export type ActionGetter<T extends Actions, C extends Record<string, unknown> = never> = (
	world: World,
	context?: C
) => T;
