import { $internal } from '../common';
import {
  createFastSetChangeFunction,
  createFastSetFunction,
  createGetFunction,
  createSetFunction,
  createStore,
  validateSchema,
} from '../storage';
import type { Norm, Schema, StoreType } from '../storage';
import type { TagTrait, Trait, TraitHooks, TraitValue } from './types';
const tagSchema = Object.freeze({});
let traitId = 0;

export function createTrait(
  schema?: undefined | Record<string, never>,
  hooks?: TraitHooks<Record<string, never>>
): TagTrait;
export function createTrait<S extends Schema>(schema: S, hooks?: TraitHooks<Norm<S>>): Trait<Norm<S>>;
export function createTrait<S extends Schema>(
  schema: S = tagSchema as S,
  hooks?: TraitHooks<Norm<S>>
): Trait<Norm<S>> {
  const isAoS = typeof schema === 'function';
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const traitType: StoreType = isAoS ? 'aos' : isTag ? 'tag' : 'soa';

  validateSchema(schema);

  const Trait = ((params?: TraitValue<Norm<S>>) => [Trait, params]) as Trait<Norm<S>>;
  Trait[$internal] = {
    id: traitId++,
    schema,
    set: createSetFunction[traitType](schema),
    fastSet: createFastSetFunction[traitType](schema),
    fastSetWithChangeDetection: createFastSetChangeFunction[traitType](schema),
    get: createGetFunction[traitType](schema),
    createStore: () => createStore<S>(schema),
    relation: null,
    type: traitType,
    hooks: hooks ? Object.freeze({ ...hooks }) : undefined,
  } as Trait<Norm<S>>[typeof $internal];

  return Trait;
}
