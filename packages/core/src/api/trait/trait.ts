import {
  $internal,
  createTrait,
  getStore as getKernelStore,
  type KernelContext,
  type Norm,
  type Schema,
  type TraitHooks as KernelTraitHooks,
} from '../../kernel';
import type { World } from '../world';
import type { ExtractStore, TagTrait, Trait, TraitHooks } from './types';

export function trait(
  schema?: undefined | Record<string, never>,
  hooks?: TraitHooks<Record<string, never>>
): TagTrait;
export function trait<S extends Schema>(schema: S, hooks?: TraitHooks<Norm<S>>): Trait<Norm<S>>;
export function trait<S extends Schema>(schema?: S, hooks?: TraitHooks<Norm<S>>): Trait<Norm<S>> {
  return createTrait<S>(schema as S, hooks as KernelTraitHooks<Norm<S>>);
}

export function getStore<C extends Trait = Trait>(
  world: World | KernelContext,
  trait: C
): ExtractStore<C> {
  return getKernelStore(
    'entityIndex' in world ? world : world[$internal].kernel,
    trait
  ) as ExtractStore<C>;
}
