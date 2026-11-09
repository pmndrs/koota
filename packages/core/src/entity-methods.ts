import {
  destroyEntity,
  entityHas,
  entityTargetFor,
  entityTargetsFor,
  subscribeEntityEvent,
} from './entity/entity';
import type { Entity, EntityMethods } from './entity/types';
import { isEntityAlive } from './entity/utils/entity-index';
import { createPageAllocator } from './entity/utils/page-allocator';
import { getEntityGeneration, getEntityId } from './entity/utils/pack-entity';
import type { Identifier, IdentifierPair } from './identifier/types';
import { subscribeMachine } from './machine/machine';
import type { Machine, TransitionSubscriber } from './machine/types';
import { setChanged } from './query/modifiers/changed';
import type { Relation, RelationPair } from './relation/types';
import type { Subscriber } from './trait/subscriptions';
import { addTrait, getTrait, removeTrait, setTrait, upsertTrait } from './trait/trait';
import type { ConfigurableTrait, Trait } from './trait/types';
import type { World, WorldContext, WorldOptions } from './world';
import type { HookInput } from './world/utils/resolve-hook';
import { createWorldWithAllocator } from './world/world';

/**
 * The one structure worlds created here share. An entity is a number, so the page that holds
 * its id is how its methods find the world that owns it. The table holds each world until it is
 * destroyed, which is what a world from the main entry avoids by owning its ids.
 */
const pageOwners: (WorldContext | null)[] = [];
const allocator = /* @__PURE__ */ createPageAllocator(pageOwners);

let installed = false;

/**
 * Creates a world whose entities carry methods, so entity.get(Position) works without the
 * world at hand. Call destroy when done with it. The methods are installed on first use.
 *
 * A program creates all of its worlds here or none of them. Ids are not marked by the kind of
 * world they came from, so a method called on an entity of a world from the main entry is not
 * caught and reaches whichever world here holds that id.
 */
export function createWorld(options?: WorldOptions): World {
  if (!installed) {
    installed = true;
    installEntityMethods();
  }
  return createWorldWithAllocator(allocator, options);
}

/** The world that owns a live entity. */
/* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return pageOwners[getEntityId(entity) >>> 10]!;
}

/** Built on first use, so a program that never creates a world here pays nothing for them. */
function installEntityMethods() {
  const methods = {
    add(this: Entity, ...traits: ConfigurableTrait[]) {
      addTrait(getEntityContext(this), this, traits);
    },

    upsert(this: Entity, trait: Trait | RelationPair, value: any) {
      upsertTrait(getEntityContext(this), this, trait, value);
    },

    remove(this: Entity, ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]) {
      return removeTrait(getEntityContext(this), this, traits);
    },

    has(this: Entity, trait: Trait | RelationPair | Identifier | IdentifierPair) {
      return entityHas(getEntityContext(this), this, trait);
    },

    destroy(this: Entity) {
      return destroyEntity(getEntityContext(this), this);
    },

    changed(this: Entity, trait: Trait) {
      return setChanged(getEntityContext(this), this, trait);
    },

    get(this: Entity, trait: Trait | RelationPair, out?: Record<string, unknown>) {
      return getTrait(getEntityContext(this), this, trait, out);
    },

    set(this: Entity, trait: Trait | RelationPair, value: any, triggerChanged = true) {
      setTrait(getEntityContext(this), this, trait, value, triggerChanged);
    },

    onTransition(this: Entity, machine: Machine, callback: TransitionSubscriber) {
      return subscribeMachine(getEntityContext(this), machine, callback, this);
    },

    onAdd(this: Entity, input: HookInput, callback: Subscriber<any>) {
      return subscribeEntityEvent(getEntityContext(this), this, 'addSubscriptions', input, callback);
    },

    onRemove(this: Entity, input: HookInput, callback: Subscriber<any>) {
      return subscribeEntityEvent(
        getEntityContext(this),
        this,
        'removeSubscriptions',
        input,
        callback
      );
    },

    onChange(this: Entity, input: HookInput, callback: Subscriber<any>) {
      return subscribeEntityEvent(
        getEntityContext(this),
        this,
        'changeSubscriptions',
        input,
        callback
      );
    },

    targetsFor(this: Entity, relation: Relation<any> | Identifier) {
      return entityTargetsFor(getEntityContext(this), this, relation);
    },

    targetFor(this: Entity, relation: Relation<any> | Identifier) {
      return entityTargetFor(getEntityContext(this), this, relation);
    },

    id(this: Entity) {
      return getEntityId(this);
    },

    generation(this: Entity) {
      return getEntityGeneration(this);
    },

    isAlive(this: Entity) {
      const owner = pageOwners[getEntityId(this) >>> 10];
      return owner != null && isEntityAlive(owner.entityIndex, this);
    },
  } as EntityMethods;

  for (const key in methods) {
    Object.defineProperty(Number.prototype, key, {
      value: methods[key as keyof EntityMethods],
      configurable: true,
      writable: true,
    });
  }
}
