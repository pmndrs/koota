import { $internal as internal } from '@koota/core';

export type MaybeGetter<T> = T | (() => T);

/**
 * Resolves a value that may be either a direct koota object (trait, relation, pair)
 * or a getter function that returns one. Distinguishes by checking for the internal
 * koota symbol — all koota objects have it, plain getter functions don't.
 */
export function resolve<T>(value: MaybeGetter<T>): T {
    return typeof value === 'function' ? (value as () => T)() : (value as T);
}
