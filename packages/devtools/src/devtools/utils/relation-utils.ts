import type { Relation, RelationPair, Trait } from '@koota/core';
import { $relation, $relationPair } from '@koota/core';

type Brand<S extends symbol> = { readonly [K in S]?: true };

export function isRelation(value: unknown): value is Relation<Trait> {
	return (value as Brand<typeof $relation> | null | undefined)?.[$relation] as unknown as boolean;
}

export function isRelationPair(value: unknown): value is RelationPair {
	return (value as Brand<typeof $relationPair> | null | undefined)?.[
		$relationPair
	] as unknown as boolean;
}
