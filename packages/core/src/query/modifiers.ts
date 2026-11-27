import { $internal } from '../internal';
import { isRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { resolveTrait } from '../trait/trait';
import type { ExtractModifierTraits, Trait, TraitInput } from '../trait/types';
import { $modifier, isModifier, isStableParameter, sameParams } from './query';
import type {
  EventType,
  Modifier,
  ModifierCache,
  ModifierInput,
  OrModifier,
  OrParameter,
} from './types';

/**
 * Returns the modifier an earlier call created from the same inputs. A query written inline
 * passes the same objects on every run, which lets the world find it again without hashing.
 */
function internModifier<TType extends string>(
  cache: ModifierCache,
  type: TType,
  id: number,
  inputs: ModifierInput[]
): Modifier<Trait[], TType> {
  const shared = cache.get(inputs[0] as object);
  if (shared !== undefined) {
    for (let i = 0; i < shared.length; i++) {
      const modifier = shared[i];
      if (sameParams(modifier.inputs!, inputs)) return modifier as Modifier<Trait[], TType>;
    }
  }
  return createSharedModifier(cache, type, id, inputs);
}

/** Shares the new modifier when its inputs are the same objects on every call. */
function createSharedModifier<TType extends string>(
  cache: ModifierCache,
  type: TType,
  id: number,
  inputs: ModifierInput[]
): Modifier<Trait[], TType> {
  // Copy first, since creating the modifier resolves the inputs in place.
  const key = inputs.length !== 0 && inputs.every(isStableParameter) ? inputs.slice() : null;
  const modifier = createModifier(type, id, inputs);
  if (key !== null) {
    modifier.inputs = key;
    const shared = cache.get(key[0]);
    if (shared === undefined) cache.set(key[0], [modifier]);
    else shared.push(modifier);
  }
  return modifier;
}

/**
 * Sorts modifier inputs into the traits its masks read, the pairs it checks per entity and the
 * modifiers nested in it. The inputs are the caller's own argument array, so the traits are
 * resolved in place.
 */
function createModifier<TType extends string>(
  type: TType,
  id: number,
  inputs: ModifierInput[]
): Modifier<Trait[], TType> {
  let pairs: RelationPair[] | null = null;
  let modifiers: Modifier[] | null = null;
  let count = 0;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (isModifier(input)) {
      (modifiers ??= []).push(input);
    } else if (isRelationPair(input)) {
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
    modifiers,
    inputs: null,
  };
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

export function createAdded() {
  const id = createTrackingId();
  const type = `added-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `added-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `added-${number}`
    >;
  };
}

export function createChanged() {
  const id = createTrackingId();
  const type = `changed-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `changed-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `changed-${number}`
    >;
  };
}

const notCache: ModifierCache = new WeakMap();

export const Not = <T extends (TraitInput | RelationPair)[] = TraitInput[]>(
  ...inputs: T
): Modifier<ExtractModifierTraits<T>, 'not'> => {
  return internModifier(notCache, 'not', 1, inputs) as Modifier<ExtractModifierTraits<T>, 'not'>;
};

const orCache: ModifierCache = new WeakMap();

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> => {
  return internModifier(orCache, 'or', 2, params) as unknown as OrModifier<T>;
};

export function createRemoved() {
  const id = createTrackingId();
  const type = `removed-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `removed-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `removed-${number}`
    >;
  };
}

// Ids 0 to 2 belong to the has, not and or modifiers, which track nothing.
let cursor = 3;

/**
 * Each tracking modifier instance gets its own id so queries built from it hash apart and keep
 * their own batch. The id carries no world state, a tracking query starts observing when it is
 * created and reads the current masks for what happened before.
 */
function createTrackingId() {
  return cursor++;
}
