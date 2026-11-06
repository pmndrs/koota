import { $internal, Brand } from '../common';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { resolveTrait } from '../trait/resolve-trait';
import type { Trait, TraitInput } from '../trait/types';
import { EventType, Modifier, QueryParameter } from './types';
import { isQuery } from './utils/is-query';
import { sameParams } from './utils/same-params';

export const $modifier = Symbol('modifier');

type ModifierInput = TraitInput | RelationPair | Modifier;

/** Modifiers shared by every call with the same inputs, listed under their first input. */
export type ModifierCache = WeakMap<object, Modifier[]>;

/**
 * Returns the modifier an earlier call created from the same inputs. A query written inline
 * passes the same objects on every run, which lets the world find it again without hashing.
 */
export function internModifier<TType extends string>(
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
export function createSharedModifier<TType extends string>(
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
 * Traits, wildcard pairs, pairs with a stable target query and shared modifiers are the same
 * object wherever they are written. A pair that names a target entity or an identifier key is a
 * new object on every call.
 */
export function isStableParameter(param: QueryParameter | ModifierInput): boolean {
  if (typeof param === 'function') return true;
  if (isRelationPair(param)) {
    const targetQuery = param.targetQuery;
    if (targetQuery === undefined) return param.target === '*';
    return isQuery(targetQuery) || targetQuery.every(isStableParameter);
  }
  return isModifier(param) && param.inputs !== null;
}

/**
 * Sorts modifier inputs into the traits its masks read, the pairs it checks per entity and the
 * modifiers nested in it. The inputs are the caller's own argument array, so the traits are
 * resolved in place.
 */
export function createModifier<TType extends string>(
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

export /* @inline @pure */ function isModifier(param: unknown): param is Modifier {
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
