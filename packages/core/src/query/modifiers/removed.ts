import { $internal } from '../../common';
import { isRelation } from '../../relation/utils/is-relation';
import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

export function createRemoved() {
  const id = createTrackingId();

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `removed-${number}`> => {
    const traits = inputs.map((input) =>
      isRelation(input) ? input[$internal].trait : input
    ) as ExtractTraits<T>;
    // Naming a trait here is what keeps its holders readable after destroy, so module scope
    // terms cover destroys from the start.
    for (let i = 0; i < traits.length; i++) traits[i][$internal].retained = true;
    return createModifier(`removed-${id}`, id, traits);
  };
}
