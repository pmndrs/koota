import { assertsEnabled, warningsEnabled } from '../build-flags';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { $internal } from '../internal';
import { subscribeTransition } from '../machine/hooks';
import type { Machine, TransitionSubscriber } from '../machine/types';
import type { Relation, RelationPair } from '../relation/types';
import { subscribeAdd, subscribeChange, subscribeRemove } from '../trait/hooks';
import {
  addTrait,
  hasTrait,
  getTraitTarget,
  getTraitTargets,
  getTrait,
  removeTrait,
  setTraitChanged,
  setTrait,
  upsertTrait,
} from '../trait/ops';
import type { ConfigurableTrait, Subscriber, Trait, TraitHookInput } from '../trait/types';
import { destroyEntity } from './entity';
import { isEntityAlive } from './entity-index';
import { getEntityGeneration, getEntityId } from './handle';
import { getEntityContext, sharedPageOwners } from './page-allocator';
import type { Entity, EntityMethods } from './types';

let installed = false;

// Keep world lookup and pair dispatch out of the bytecode for repeated plain trait checks.
function hasWithWorld(entity: Entity, trait: Trait | RelationPair | Identifier | IdentifierPair) {
  return hasTrait(getEntityContext(entity), entity, trait);
}

/**
 * Puts the methods on Number.prototype, so entity.get(Position) works without the world at hand.
 * It runs when the first world that shares the allocator is created, so a program that only
 * creates isolated worlds never touches the prototype.
 */
export function installEntityMethods() {
  if (installed) return;
  installed = true;

  const methods = {
    add(this: Entity, ...traits: ConfigurableTrait[]) {
      addTrait(getEntityContext(this), this, traits);
    },

    upsert(this: Entity, trait: Trait | RelationPair, value: any) {
      upsertTrait(getEntityContext(this), this, trait, value);
    },

    remove(this: Entity, ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]) {
      const ctx = sharedPageOwners[getEntityId(this) >>> 10];
      // A released page has no owner. Its world was destroyed, so nothing is left to remove.
      if (ctx !== null) removeTrait(ctx, this, ...traits);
    },

    has(this: Entity, trait: Trait | RelationPair | Identifier | IdentifierPair) {
      if (typeof trait !== 'function' || assertsEnabled) {
        return hasWithWorld(this, trait);
      }
      // An identifier reads the same mask slot as its backing trait.
      const eid = getEntityId(this);
      const mask = trait[$internal].sharedMask;
      return (mask.table[eid >>> 10][(eid & 1023) << 2] & mask.bit) !== 0;
    },

    destroy(this: Entity) {
      const ctx = sharedPageOwners[getEntityId(this) >>> 10];
      // A released page has no owner. Its world was destroyed and the entity with it.
      if (ctx !== null) destroyEntity(ctx, this);
    },

    changed(this: Entity, trait: Trait) {
      return setTraitChanged(getEntityContext(this), this, trait);
    },

    get(this: Entity, trait: Trait | RelationPair, out?: Record<string, unknown>) {
      return getTrait(getEntityContext(this), this, trait, out);
    },

    set(this: Entity, trait: Trait | RelationPair, value: any, triggerChanged = true) {
      setTrait(getEntityContext(this), this, trait, value, triggerChanged);
    },

    onTransition(this: Entity, machine: Machine, callback: TransitionSubscriber) {
      return subscribeTransition(getEntityContext(this), machine, callback, this);
    },

    onAdd(this: Entity, input: TraitHookInput, callback: Subscriber<any>) {
      return subscribeAdd(getEntityContext(this), this, input, callback);
    },

    onRemove(this: Entity, input: TraitHookInput, callback: Subscriber<any>) {
      return subscribeRemove(getEntityContext(this), this, input, callback);
    },

    onChange(this: Entity, input: TraitHookInput, callback: Subscriber<any>) {
      return subscribeChange(getEntityContext(this), this, input, callback);
    },

    targetsFor(this: Entity, relation: Relation<any> | Identifier) {
      return getTraitTargets(getEntityContext(this), this, relation);
    },

    targetFor(this: Entity, relation: Relation<any> | Identifier) {
      return getTraitTarget(getEntityContext(this), this, relation);
    },

    id(this: Entity) {
      return getEntityId(this);
    },

    generation(this: Entity) {
      return getEntityGeneration(this);
    },

    isAlive(this: Entity) {
      const owner = sharedPageOwners[getEntityId(this) >>> 10];
      return owner != null && isEntityAlive(owner.entityIndex, this);
    },
  } as EntityMethods;

  // Methods already there belong to another copy of koota. A realm has one Number.prototype, so
  // this copy takes them over and the entities of the earlier copy reach the wrong worlds.
  if (warningsEnabled && Object.hasOwn(Number.prototype, 'targetsFor')) {
    console.warn(
      'Koota: Entity methods are already installed, so more than one copy of koota is loaded. Entities of the earlier copy now reach the wrong worlds. Load one copy, or create the worlds of one of them with koota/isolated.'
    );
  }
  for (const key of Object.keys(methods) as (keyof EntityMethods)[]) {
    Object.defineProperty(Number.prototype, key, {
      value: methods[key],
      configurable: true,
      writable: true,
    });
  }
}
