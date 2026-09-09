import {
  $internal,
  $modifier,
  createModifier,
  createTrackingId,
  isRelation,
  setTrackingMasks,
  universe,
} from '../../kernel';
import type { ExtractTraits, Trait, TraitOrRelation } from '../trait/types';
import type { Modifier, OrModifier, OrParameter } from './types';

/** Relations stand in for their underlying trait when used as a query parameter. */
function resolveTraits<T extends TraitOrRelation[]>(inputs: T): ExtractTraits<T> {
  return inputs.map((input) =>
    isRelation(input) ? input[$internal].trait : input
  ) as ExtractTraits<T>;
}

/**
 * Tracking modifiers (Added/Changed/Removed) each claim a tracking id and need
 * backing masks in every registered context, including existing contexts.
 */
function createTrackingModifier<TName extends string>(name: TName) {
  const id = createTrackingId();

  for (const ctx of universe.contexts) {
    if (!ctx) continue;
    setTrackingMasks(ctx, id);
  }

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `${TName}-${number}`> =>
    createModifier(`${name}-${id}`, id, resolveTraits(inputs));
}

export const createAdded = () => createTrackingModifier('added');
export const createChanged = () => createTrackingModifier('changed');
export const createRemoved = () => createTrackingModifier('removed');

export const Not = <T extends TraitOrRelation[] = TraitOrRelation[]>(
  ...inputs: T
): Modifier<ExtractTraits<T>, 'not'> => createModifier('not', 1, resolveTraits(inputs));

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> => {
  // Separate traits from nested modifiers
  const traits: Trait[] = [];
  const modifiers: Modifier[] = [];

  for (const param of params) {
    if ((param as Modifier)[$modifier]) {
      modifiers.push(param as Modifier);
    } else {
      traits.push(isRelation(param) ? param[$internal].trait : (param as Trait));
    }
  }

  const modifier = createModifier('or', 2, traits) as OrModifier<T>;
  modifier.modifiers = modifiers;

  return modifier;
};
