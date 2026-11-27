import { $internal } from '../internal';
import type { World, WorldContext } from '../world/types';
import { createSubscriptions } from './hooks';
import { claimMaskSlot, ensureMaskTable } from './mask-table';
import type { ExtractStore, Trait, TraitInstance, TraitInstanceArray } from './types';

export function registerTrait(ctx: WorldContext, trait: Trait): TraitInstance {
  const traitCtx = trait[$internal];
  traitCtx.registered = true;

  // The slot is the trait's in every world. This world keeps the generation's table and bit.
  const slot = claimMaskSlot(trait.id);
  const generationId = (slot / 31) | 0;

  const data: TraitInstance = {
    version: 0,
    generationId,
    masks: ensureMaskTable(ctx.entityMasks, ctx.emptyMaskTable, generationId),
    bitflag: 1 << (slot % 31),
    trait,
    store: traitCtx.createStore(),
    queries: [],
    trackingQueries: [],
    relationQueries: [],
    relationQueryIdentifiers: undefined,
    anchorRelations: [],
    schema: trait.schema,
    changeSubscriptions: createSubscriptions(),
    addSubscriptions: createSubscriptions(),
    removeSubscriptions: createSubscriptions(),
    relationFilterHooks: null,
    // Declared up front so relation and plain trait instances share one hidden class.
    relationTargets: undefined,
    relationSlots: undefined,
    relationSourcesByTarget: undefined,
    machine: undefined,
    identifier: undefined,
  };

  setTraitInstance(ctx.traitInstances, trait, data);
  (ctx.traitsByBit[generationId] ??= [])[slot % 31] = data;
  ctx.traits.add(trait);

  traitCtx.onRegister?.(ctx, data);

  if (ctx.traitRegisteredSubscriptions.size > 0) {
    for (const sub of ctx.traitRegisteredSubscriptions) sub(trait);
  }

  return data;
}

/** Raw writes bypass accessors. Callers must preserve any trait-owned invariants. */
export /* @pure */ function getStore<C extends Trait = Trait>(
  ctxOrWorld: WorldContext | World,
  trait: C
): ExtractStore<C> {
  const ctx =
    'traitInstances' in ctxOrWorld ? (ctxOrWorld as WorldContext) : (ctxOrWorld as World)[$internal];
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  return instance.store as ExtractStore<C>;
}

export function ensureTraitInstance(ctx: WorldContext, trait: Trait): TraitInstance {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance !== undefined) return instance;
  registerTrait(ctx, trait);
  // Registration hooks can replace the world's instances.
  return getTraitInstance(ctx.traitInstances, trait)!;
}

/**
 * Get TraitInstance by trait ID
 */
export /* @inline @pure */ function getTraitInstance<T extends Trait>(
  traitData: TraitInstanceArray,
  trait: T
): TraitInstance<T> | undefined {
  return traitData[trait.id] as TraitInstance<T> | undefined;
}

/**
 * Set TraitInstance by trait ID
 */
function setTraitInstance(traitData: TraitInstanceArray, trait: Trait, data: TraitInstance): void {
  const traitId = trait.id;
  // Ensure array is large enough
  if (traitId >= traitData.length) {
    traitData.length = traitId + 1;
  }
  traitData[traitId] = data;
}

/**
 * Check if trait is registered
 */
export /* @inline @pure */ function hasTraitInstance(
  traitData: TraitInstanceArray,
  trait: Trait
): boolean {
  const traitId = trait.id;
  return traitId < traitData.length && traitData[traitId] !== undefined;
}

/**
 * Clear all trait data
 */
export function clearTraitInstances(traitData: TraitInstanceArray): void {
  traitData.length = 0;
}
