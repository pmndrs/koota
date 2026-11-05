import { $internal, Brand } from '../common';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { resolveTrait } from '../trait/resolve-trait';
import type { Trait, TraitInput } from '../trait/types';
import { EventType, Modifier, QueryParameter } from './types';

export const $modifier = Symbol('modifier');

/**
 * Sorts modifier inputs into the traits its masks read and the pairs it checks per entity. The
 * inputs are the caller's own argument array, so the traits are resolved in place.
 */
export function createModifier<TType extends string>(
  type: TType,
  id: number,
  inputs: (TraitInput | RelationPair)[]
): Modifier<Trait[], TType> {
  let pairs: RelationPair[] | null = null;
  let count = 0;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (isRelationPair(input)) {
      if (input.target !== '*') {
        (pairs ??= []).push(input);
        continue;
      }
      // A wildcard pair is the relation's membership, which the trait masks cover.
      inputs[count++] = input.relation[$internal].trait;
    } else {
      inputs[count++] = resolveTrait(input);
    }
  }
  if (count !== inputs.length) inputs.length = count;

  const traits = inputs as Trait[];
  return {
    [$modifier]: true,
    type,
    id,
    traits,
    traitIds: traits.map((trait) => trait.id),
    pairs,
    modifiers: null,
  };
}

export /* @inline @pure */ function isModifier(param: QueryParameter): param is Modifier {
  return (param as Brand<typeof $modifier> | null | undefined)?.[$modifier] as unknown as boolean;
}

/** Check if a modifier is a tracking modifier (added, removed or changed) */
export function isTrackingModifier(modifier: Modifier): boolean {
  const { type } = modifier;
  return type.includes('added') || type.includes('removed') || type.includes('changed');
}

/** Get the tracking type from a modifier */
export function getTrackingType(modifier: Modifier): EventType | null {
  const { type } = modifier;
  if (type.includes('added')) return 'add';
  if (type.includes('removed')) return 'remove';
  if (type.includes('changed')) return 'change';
  return null;
}
