import type { World } from '../world';

export type ActionsInstance = Record<string, (...args: any[]) => void>;
export type ActionsDefinition<T extends ActionsInstance> = (world: World) => T;
export type ActionsRef<T extends ActionsInstance> = {
	/** Public read-only ID for fast array lookups */
	readonly id: number;
	/** Initializer function */
	readonly initializer: ActionsDefinition<T>;
} & ((world: World) => T);

/** @deprecated Use ActionsInstance instead */
export type Actions = ActionsInstance;
/** @deprecated Use ActionsDefinition instead */
export type ActionInitializer<T extends ActionsInstance> = ActionsDefinition<T>;
/** @deprecated Use ActionsRef instead */
export type ActionGetter<T extends ActionsInstance> = ActionsRef<T>;
