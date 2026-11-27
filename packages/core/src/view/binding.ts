import type { SparseSet } from '@koota/collections';
import { isIdentifier, isIdentifierPair } from '../identifier/identifier';
import { $internal } from '../internal';
import { createQuery, isModifier, isQuery, sameParams } from '../query/query';
import type { QueryParameter } from '../query/types';
import { isRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { ensureTraitInstance, getTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { ensureViewIterators } from './iteration';
import type { TargetProjection, ViewBinding, ViewScope } from './types';

/** Handle-only snapshots need no world-specific stores or cached view. */
const entityBinding: ViewBinding = {
  iterationBuffers: undefined,
  params: [],
  traits: [],
  instances: [],
  stores: [],
  projection: [],
  targets: [],
  view: null,
  iterators: null,
  untracked: -1,
};

/** A scope caches a binding for each distinct projection. A list binds without one. */
export function ensureViewBinding(
  ctx: WorldContext,
  scope: ViewScope | null,
  params: QueryParameter[]
): ViewBinding {
  if (
    scope === null &&
    (params.length === 0 ||
      (params.length === 1 &&
        (isIdentifierPair(params[0]) ||
          (isRelationPair(params[0]) && typeof params[0].target === 'number'))))
  ) {
    return entityBinding;
  }
  const cache = scope?.viewBindings;
  if (cache) {
    for (let i = 0; i < cache.length; i++) {
      const binding = cache[i];
      if (matchesViewBinding(ctx, scope, params, binding)) return binding;
    }
  }
  const binding: ViewBinding = {
    iterationBuffers: undefined,
    params,
    traits: [],
    instances: [],
    stores: [],
    projection: [],
    targets: [],
    view: null,
    iterators: null,
    untracked: -1,
  };
  fillViewBinding(ctx, scope, params, binding);
  if (cache) cache.push(binding);
  else binding.iterators = ensureViewIterators(binding.traits, binding.projection);
  return binding;
}

/** Different parameter lists can supply the same callback arguments in the same order. */
export function matchesViewBinding(
  ctx: WorldContext,
  scope: ViewScope | null,
  params: QueryParameter[],
  binding: ViewBinding
): boolean {
  if (sameParams(binding.params, params)) return true;
  const { stores, projection, targets } = binding;
  let index = 0;
  let argument = 0;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isIdentifierPair(param) || isIdentifier(param)) continue;
    if (isRelationPair(param)) {
      if (typeof param.target === 'number') continue;
      if (!matchesPairProjection(ctx, scope, param, projection[argument], targets[argument])) {
        return false;
      }
      argument++;
      continue;
    }
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (let j = 0; j < param.traits.length; j++) {
        const trait = param.traits[j];
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        if (
          projection[argument++] !== trait ||
          getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
        )
          return false;
        index++;
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      if (
        projection[argument++] !== trait ||
        getTraitInstance(ctx.traitInstances, trait)?.store !== stores[index]
      )
        return false;
      index++;
    }
  }
  return argument === projection.length;
}

/** Collects the stored traits of a parameter list in order, registering any that are new. */
function fillViewBinding(
  ctx: WorldContext,
  scope: ViewScope | null,
  params: QueryParameter[],
  binding: ViewBinding
) {
  const { traits, instances, stores, projection, targets } = binding;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isIdentifierPair(param) || isIdentifier(param)) continue;
    if (isRelationPair(param)) {
      if (typeof param.target === 'number') continue;
      bindPairProjection(ctx, scope, param, binding);
      continue;
    }
    if (isModifier(param)) {
      if (param.type === 'not') continue;
      for (let j = 0; j < param.traits.length; j++) {
        const trait = param.traits[j];
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        traits.push(trait);
        projection.push(trait);
        targets.push(undefined);
        const instance = ensureTraitInstance(ctx, trait);
        instances.push(instance);
        stores.push(instance.store);
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      traits.push(trait);
      projection.push(trait);
      targets.push(undefined);
      const instance = ensureTraitInstance(ctx, trait);
      instances.push(instance);
      stores.push(instance.store);
    }
  }
}

/** Registers relation storage and resolves its target query once when a binding is created. */
function bindPairProjection(
  ctx: WorldContext,
  scope: ViewScope | null,
  pair: RelationPair,
  binding: ViewBinding
) {
  const instance = ensureTraitInstance(ctx, pair.relation[$internal].trait);
  const exclusive = pair.relation[$internal].exclusive;
  const matches =
    !exclusive && pair.targetQuery !== undefined ? findTargetMatches(scope, pair) : undefined;
  binding.projection.push(
    internTargetProjection(instance, matches === undefined ? 'slot' : 'filter')
  );
  binding.targets.push(matches);
}

const targetProjections = new WeakMap<
  TraitInstance,
  Partial<Record<TargetProjection['mode'], TargetProjection>>
>();

/** One interned entry per instance and mode, so bindings and iterator caches compare identity. */
function internTargetProjection(
  instance: TraitInstance,
  mode: TargetProjection['mode']
): TargetProjection {
  let modes = targetProjections.get(instance);
  if (modes === undefined) targetProjections.set(instance, (modes = {}));
  return (modes[mode] ??= { instance, mode });
}

/** A pair matches a stored projection by relation instance, read mode and target query match set. */
function matchesPairProjection(
  ctx: WorldContext,
  scope: ViewScope | null,
  pair: RelationPair,
  entry: Trait | TargetProjection | undefined,
  target: SparseSet | undefined
): boolean {
  if (entry === undefined || typeof entry === 'function') return false;
  const instance = getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait);
  if (instance !== entry.instance) return false;
  const exclusive = pair.relation[$internal].exclusive;
  const matches =
    !exclusive && pair.targetQuery !== undefined ? findTargetMatches(scope, pair) : undefined;
  return entry.mode === (matches === undefined ? 'slot' : 'filter') && matches === target;
}

/**
 * The match set of the scope's own filter for this pair, kept current by the target query.
 * Target queries are compared by identity or entry by entry first, and hashed only when
 * that fails, so a cached binding lookup does not pay for a hash.
 */
function findTargetMatches(scope: ViewScope | null, pair: RelationPair): SparseSet | undefined {
  const pairs = scope?.filters?.pairs;
  if (pairs === undefined) return undefined;
  const targetQuery = pair.targetQuery!;
  for (let i = 0; i < pairs.length; i++) {
    const filter = pairs[i];
    if (filter.relation !== pair.relation || filter.targetQuery === undefined) continue;
    if (
      filter.targetQuery === targetQuery ||
      (!isQuery(targetQuery) &&
        !isQuery(filter.targetQuery) &&
        sameParams(filter.targetQuery, targetQuery))
    ) {
      return filter.targetQueryMatches;
    }
  }
  const definition = isQuery(targetQuery) ? targetQuery : createQuery(...targetQuery);
  for (let i = 0; i < pairs.length; i++) {
    const filter = pairs[i];
    if (filter.relation === pair.relation && filter.resolvedTargetQuery === definition) {
      return filter.targetQueryMatches;
    }
  }
  return undefined;
}
