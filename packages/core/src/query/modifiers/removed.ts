import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import { createModifier, internModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

function buildRemoved(id: number, inputs: readonly TraitOrRelation[]): Modifier {
  return createModifier(`removed-${id}`, id, inputs);
}

export function createRemoved() {
  const id = createTrackingId();

  for (const ctx of universe.worlds) {
    if (!ctx) continue;
    setTrackingMasks(ctx, id);
  }

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `removed-${number}`> =>
    internModifier(id, inputs, buildRemoved) as Modifier<ExtractTraits<T>, `removed-${number}`>;
}
