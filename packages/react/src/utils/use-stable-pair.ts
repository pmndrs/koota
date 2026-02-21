import { $internal, $relationPair, type RelationPair, type Trait } from '@koota/core';
import { useMemo } from 'react';

type TraitOrPair<T extends Trait = Trait> = T | RelationPair<T>;

function isRelationPair(value: unknown): value is RelationPair {
    return !!(value as any)?.[$relationPair];
}

/**
 * Stabilizes a trait-or-pair argument for use in React deps arrays.
 * Plain traits are already referentially stable (defined once).
 * Relation pairs like `ChildOf(parent)` create a new object each render,
 * so we memoize based on the underlying relation + target identity.
 */
export function useStableTrait<T extends Trait>(input: TraitOrPair<T>): TraitOrPair<T> {
    const relation = isRelationPair(input) ? input[$internal].relation : input;
    const pairTarget = isRelationPair(input) ? input[$internal].target : undefined;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => input, [relation, pairTarget]);
}
