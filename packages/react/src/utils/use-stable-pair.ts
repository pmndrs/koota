import { isPairPattern, type RelationPair, type RelationPairPattern, type Trait } from '@koota/core';
import { useMemo } from 'react';

type TraitOrPair = Trait | RelationPair | RelationPairPattern;

/**
 * Stabilizes a trait-or-pair argument for use in React deps arrays.
 * Plain traits are already referentially stable (defined once).
 * Relation pairs like `ChildOf(parent)` create a new object each render,
 * so we memoize based on the underlying relation + target identity.
 */
export function useStableTrait(input: TraitOrPair): TraitOrPair {
    const relation = isPairPattern(input) ? input[0] : input;
    const pairTarget = isPairPattern(input) ? input[1] : undefined;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => input, [relation, pairTarget]);
}
