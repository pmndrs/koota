import type { Entity } from '../entity/types';
import type { RelationPair } from '../relation/types';
import {
  $internal,
  createTrait,
  getEntityContext,
  getTraitVersionSource as getVersionSource,
  isRelationPair,
  type VersionSource,
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
    $internal in world ? world[$internal].kernel : world,
    trait
  ) as ExtractStore<C>;
}

/** Stable revision source for one trait registration, replaced when the world resets. */
export function getTraitVersionSource(
  entity: Entity,
  trait: Trait | RelationPair
): VersionSource | undefined {
  const ctx = getEntityContext(entity);
  if (!ctx) return undefined;
  return getVersionSource(ctx, isRelationPair(trait) ? trait.relation[$internal].trait : trait);
}
