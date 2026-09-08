import { $internal, Brand } from '../common';
import { isRelation } from '../relation/utils/is-relation';
import { Trait, TraitOrRelation } from '../trait/types';
import { nextQueryToken } from './utils/query-token';
import { EventType, Modifier, OrModifier, QueryParameter } from './types';

export const $modifier = Symbol('modifier');

export function createModifier<TTrait extends Trait[] = Trait[], TType extends string = string>(
  type: TType,
  id: number,
  inputs: readonly TraitOrRelation[]
): Modifier<TTrait, TType> {
  const traits = inputs.map((input) => (isRelation(input) ? input[$internal].trait : input));
  return {
    [$modifier]: true,
    queryToken: nextQueryToken(),
    type,
    id,
    traits,
    traitIds: traits.map((trait) => trait.id),
    // Declared up front so Or, which fills it in, shares one shape with every other modifier.
    modifiers: undefined,
  } as unknown as Modifier<TTrait, TType>;
}

type InternNode = { children: WeakMap<object, InternNode>; modifier: Modifier | undefined };

const internRoots = new Map<number, InternNode>();

/**
 * Modifiers are immutable values, so repeat calls with the same inputs hand back one shared
 * instance. Inline queries stop allocating a modifier per call, and the query hash memo can
 * key the modifier as a single stable token instead of expanding its trait ids.
 *
 * Ids separate the kinds: 1 is Not, 2 is Or, and every tracking modifier factory mints its
 * own id from 3 up, so the id alone identifies the branch without the type string.
 */
export function internModifier(
  id: number,
  inputs: readonly TraitOrRelation[],
  build: (id: number, inputs: readonly TraitOrRelation[]) => Modifier
): Modifier {
  let node = internRoots.get(id);
  if (node === undefined) {
    node = { children: new WeakMap(), modifier: undefined };
    internRoots.set(id, node);
  }
  for (let i = 0; i < inputs.length; i++) node = internStep(node, inputs[i]);
  return (node.modifier ??= build(id, inputs));
}

function internStep(node: InternNode, token: object): InternNode {
  let next = node.children.get(token);
  if (next === undefined) {
    next = { children: new WeakMap(), modifier: undefined };
    node.children.set(token, next);
  }
  return next;
}

export function resetModifiers(): void {
  internRoots.clear();
}

export /* @inline @pure */ function isModifier(param: QueryParameter): param is Modifier {
  return (param as Brand<typeof $modifier> | null | undefined)?.[$modifier] as unknown as boolean;
}

/** Check if a modifier is a tracking modifier (added, removed, or changed) */
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

/** Check if an Or modifier has nested modifiers */
export function isOrWithModifiers(modifier: Modifier): modifier is OrModifier {
  return modifier.type === 'or' && Array.isArray((modifier as OrModifier).modifiers);
}
