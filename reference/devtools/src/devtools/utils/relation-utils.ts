import type { Relation, RelationPair, Trait } from '@koota/core';
import { $relation, $relationPair } from '@koota/core';

/**
 * Type utility for symbol-branded runtime type checks.
 */
type Brand<S extends symbol> = { readonly [K in S]?: true };

/**
 * Check if a value is a Relation
 */
export function isRelation(value: unknown): value is Relation<Trait> {
	return (value as Brand<typeof $relation> | null | undefined)?.[$relation] as unknown as boolean;
}

/**
 * Check if a value is a RelationPair
 */
export function isRelationPair(value: unknown): value is RelationPair {
	return (value as Brand<typeof $relationPair> | null | undefined)?.[
		$relationPair
	] as unknown as boolean;
}

