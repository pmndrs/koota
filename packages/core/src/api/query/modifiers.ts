import { createTracker, type Tracker } from '../../kernel';
import { isRelation } from '../relation/relation';
import { $internal, $modifier, type Brand } from '../symbols';
import type { ExtractTraits, Trait, TraitOrRelation } from '../trait/types';
import type { Modifier, OrModifier, OrParameter } from './types';

/** Relations stand in for their underlying trait when used as a query parameter. */
function resolveTraits<T extends TraitOrRelation[]>(inputs: T): ExtractTraits<T> {
  return inputs.map((input) => (isRelation(input) ? input[$internal].trait : input)) as ExtractTraits<T>;
}

let modifierId = 3;

function createModifier<TTrait extends Trait[], TType extends string>(
  type: TType,
  id: number,
  traits: TTrait,
  tracker: Tracker | null
): Modifier<TTrait, TType> {
  return { [$modifier]: true, type, id, traits, tracker, modifiers: null };
}

export function isModifier(value: unknown): value is Modifier {
  return (value as Brand<typeof $modifier> | null | undefined)?.[$modifier] === true;
}

/** Tracking modifiers (Added/Changed/Removed) each own a tracker with its own baseline. */
function createTrackingModifier<TName extends string>(name: TName) {
  const tracker = createTracker();
  const id = modifierId++;
  return <T extends TraitOrRelation[]>(...inputs: T): Modifier<ExtractTraits<T>, `${TName}-${number}`> =>
    createModifier(`${name}-${id}`, id, resolveTraits(inputs), tracker);
}

export const createAdded = () => createTrackingModifier('added');
export const createChanged = () => createTrackingModifier('changed');
export const createRemoved = () => createTrackingModifier('removed');

export const Not = <T extends TraitOrRelation[] = TraitOrRelation[]>(
  ...inputs: T
): Modifier<ExtractTraits<T>, 'not'> => createModifier('not', 1, resolveTraits(inputs), null);

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> => {
  const traits: Trait[] = [];
  const modifiers: Modifier[] = [];
  for (const param of params) {
    if (isModifier(param)) modifiers.push(param);
    else traits.push(isRelation(param) ? param[$internal].trait : (param as Trait));
  }
  const modifier = createModifier('or', 2, traits, null) as OrModifier<T>;
  modifier.modifiers = modifiers;
  return modifier;
};

export function trackingEvent(modifier: Modifier): 'added' | 'changed' | 'removed' | null {
  if (modifier.type.startsWith('added')) return 'added';
  if (modifier.type.startsWith('changed')) return 'changed';
  if (modifier.type.startsWith('removed')) return 'removed';
  return null;
}
