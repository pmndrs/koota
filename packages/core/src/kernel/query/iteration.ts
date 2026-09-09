import type { Entity } from '../entity/types';
import { $internal } from '../common';
import { getEntityId } from '../entity/pack-entity';
import { isEntityAlive } from '../entity/entity-index';
import { getTraitInstance, registerTrait } from '../trait/trait';
import { hasSubscribers } from '../trait/subscriptions';
import type { Trait } from '../trait/types';
import type { Store } from '../storage';
import type { KernelContext } from '../context';
import { setChanged } from '../commands/operations';
import { isRelationPair } from '../relation/is-relation';
import { isModifier } from './modifier';
import type { QueryInstance, QueryParameter } from './types';
import { shallowEqual } from '../utils/shallow-equal';

type IterationCallback = (values: any[], entity: number, index: number) => void;

export function readQueryEntities(
  entities: number[],
  traits: Trait[],
  stores: Store<any>[],
  callback: IterationCallback
): void {
  const state = Array.from({ length: traits.length });
  for (let i = 0; i < entities.length; i++) {
    createSnapshots(getEntityId(entities[i]), traits, stores, state);
    callback(state, entities[i], i);
  }
}

export function updateQueryEntities(
  ctx: KernelContext,
  query: QueryInstance,
  entities: number[],
  traits: Trait[],
  stores: Store<any>[],
  callback: IterationCallback,
  changeDetection: 'auto' | 'always' | 'never' = 'auto'
): void {
  const state = Array.from({ length: traits.length });

  // Invalidate once per trait even when auto or never skips change detection.
  if (entities.length !== 0) {
    for (let i = 0; i < traits.length; i++) {
      getTraitInstance(ctx.traitInstances, traits[i])!.version++;
    }
  }

  if (changeDetection === 'auto') {
    const changedPairs: [Entity, Trait][] = [];
    const atomicSnapshots: any[] = [];
    const trackedIndices: number[] = [];
    const untrackedIndices: number[] = [];

    getTrackedTraits(traits, ctx, query, trackedIndices, untrackedIndices);

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const eid = getEntityId(entity);

      createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
      callback(state, entity, i);

      if (!isEntityAlive(ctx.entityIndex, entity)) continue;

      for (let j = 0; j < trackedIndices.length; j++) {
        const index = trackedIndices[j];
        const trait = traits[index];
        const traitCtx = trait[$internal];
        const newValue = state[index];
        const store = stores[index];

        let changed = false;
        if (traitCtx.type === 'aos') {
          changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
          if (!changed) {
            changed = !shallowEqual(newValue, atomicSnapshots[index]);
          }
        } else {
          changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
        }

        if (changed) changedPairs.push([entity, trait] as const);
      }

      for (let j = 0; j < untrackedIndices.length; j++) {
        const index = untrackedIndices[j];
        const trait = traits[index];
        const traitCtx = trait[$internal];
        const store = stores[index];
        traitCtx.fastSet(eid, store, state[index]);
      }
    }

    for (let i = 0; i < changedPairs.length; i++) {
      const [entity, trait] = changedPairs[i];
      setChanged(ctx, entity, trait);
    }
  } else if (changeDetection === 'always') {
    const changedPairs: [Entity, Trait][] = [];
    const atomicSnapshots: any[] = [];

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const eid = getEntityId(entity);

      createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
      callback(state, entity, i);

      if (!isEntityAlive(ctx.entityIndex, entity)) continue;

      for (let j = 0; j < traits.length; j++) {
        const trait = traits[j];
        const traitCtx = trait[$internal];
        const newValue = state[j];

        let changed = false;
        if (traitCtx.type === 'aos') {
          changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
          if (!changed) {
            changed = !shallowEqual(newValue, atomicSnapshots[j]);
          }
        } else {
          changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
        }

        if (changed) changedPairs.push([entity, trait] as const);
      }
    }

    for (let i = 0; i < changedPairs.length; i++) {
      const [entity, trait] = changedPairs[i];
      setChanged(ctx, entity, trait);
    }
  } else if (changeDetection === 'never') {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const eid = getEntityId(entity);
      createSnapshots(eid, traits, stores, state);
      callback(state, entity, i);

      if (!isEntityAlive(ctx.entityIndex, entity)) continue;

      for (let j = 0; j < traits.length; j++) {
        const trait = traits[j];
        const traitCtx = trait[$internal];
        traitCtx.fastSet(eid, stores[j], state[j]);
      }
    }
  }
}

/* @inline */ function getTrackedTraits(
  traits: Trait[],
  ctx: KernelContext,
  query: QueryInstance,
  trackedIndices: number[],
  untrackedIndices: number[]
) {
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const instance = getTraitInstance(ctx.traitInstances, trait);
    const hasTracked = instance !== undefined && hasSubscribers(instance.changeSubscriptions);
    const hasChanged = query.hasChangedModifiers && query.changedTraits.has(trait);

    if (hasTracked || hasChanged || trait[$internal].hooks?.onSet) trackedIndices.push(i);
    else untrackedIndices.push(i);
  }
}

/* @inline */ function createSnapshots(
  entityId: number,
  traits: Trait[],
  stores: Store<any>[],
  state: any[]
) {
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const ctx = trait[$internal];
    const value = ctx.get(entityId, stores[i]);
    state[i] = value;
  }
}

/* @inline */ function createSnapshotsWithAtomic(
  entityId: number,
  traits: Trait[],
  stores: Store<any>[],
  state: any[],
  atomicSnapshots: any[]
) {
  for (let j = 0; j < traits.length; j++) {
    const trait = traits[j];
    const ctx = trait[$internal];
    const value = ctx.get(entityId, stores[j]);
    state[j] = value;
    atomicSnapshots[j] = ctx.type === 'aos' ? { ...value } : null;
  }
}

export function getQueryStores<T extends QueryParameter[]>(
  params: T,
  traits: Trait[],
  stores: Store<any>[],
  ctx: KernelContext
) {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];

    if (isRelationPair(param)) continue;

    if (isModifier(param)) {
      if (param.type === 'not') continue;

      const modifierTraits = param.traits;
      for (const trait of modifierTraits) {
        if (trait[$internal].type === 'tag' || trait[$internal].relation) continue;
        traits.push(trait);
        stores.push(getQueryStore(ctx, trait));
      }
    } else {
      const trait = param as Trait;
      if (trait[$internal].type === 'tag') continue;
      traits.push(trait);
      stores.push(getQueryStore(ctx, trait));
    }
  }
}

function getQueryStore(ctx: KernelContext, trait: Trait): Store<any> {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (instance) return instance.store;
  registerTrait(ctx, trait);
  return getTraitInstance(ctx.traitInstances, trait)!.store;
}
