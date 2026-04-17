import { $internal } from '../../common';
import { isRelation } from '../../relation/utils/is-relation';
import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createAdded() {
    const id = createTrackingId();

    for (const ctx of universe.worlds) {
        if (!ctx) continue;
        setTrackingMasks(ctx, id);
    }

    return <T extends TraitOrRelation[]>(
        ...inputs: T
    ): Modifier<ExtractTraits<T>, `added-${number}`> => {
        const traits = inputs.map((input) =>
            isRelation(input) ? input[$internal].trait : input
        ) as ExtractTraits<T>;
        return createModifier(`added-${id}`, id, traits);
    };
}
