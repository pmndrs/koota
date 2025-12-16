import type { World } from '../world';

export type Actions = Record<string, (...args: any[]) => void>;
export type ActionInitializer<T extends Actions> = (world: World) => T;
export type ActionGetter<T extends Actions> = (world: World) => T;
