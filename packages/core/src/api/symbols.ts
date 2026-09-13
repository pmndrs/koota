export const $internal = Symbol.for('koota.internal');
export const $relationPair = Symbol.for('relationPair');
export const $relation = Symbol.for('relation');
export const $queryRef = Symbol.for('queryRef');
export const $parameters = Symbol.for('parameters');
export const $modifier = Symbol.for('koota.modifier');

/** Type utility for symbol-branded runtime type checks. */
export type Brand<S extends symbol> = { readonly [K in S]?: true };
