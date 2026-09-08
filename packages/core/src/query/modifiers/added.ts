import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import { createModifier, internModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

function buildAdded(id: number, inputs: readonly TraitOrRelation[]): Modifier {
  return createModifier(`added-${id}`, id, inputs);
}

export function createAdded() {
  const id = createTrackingId();

  for (const ctx of universe.worlds) {
    if (!ctx) continue;
    setTrackingMasks(ctx, id);
  }

  return <T extends TraitOrRelation[]>(...inputs: T): Modifier<ExtractTraits<T>, `added-${number}`> =>
    internModifier(id, inputs, buildAdded) as Modifier<ExtractTraits<T>, `added-${number}`>;
}
