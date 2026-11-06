import { setChanged } from '../query/modifiers/changed';
import { getFirstRelationTarget, getRelationTargets } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isIdentifier, getIdentifierTarget } from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { addTrait, getTrait, removeTrait, setTrait, upsertTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { Subscriber } from '../trait/subscriptions';
import type { HookInput } from '../world/utils/resolve-hook';
import { destroyEntity, entityHas, getEntityContext, subscribeEntityEvent } from './entity';
import type { Entity } from './types';
import { getEntityGeneration, getEntityId } from './utils/pack-entity';
import { addressSpace } from './utils/address-space';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
  return addTrait(getEntityContext(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.upsert = function (this: Entity, trait: Trait | RelationPair, value: any) {
  upsertTrait(getEntityContext(this), this, trait, value);
};

// @ts-expect-error
Number.prototype.remove = function (
  this: Entity,
  ...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]
) {
  return removeTrait(getEntityContext(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (
  this: Entity,
  trait: Trait | RelationPair | Identifier | IdentifierPair
) {
  return entityHas(getEntityContext(this), this, trait);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
  return destroyEntity(getEntityContext(this), this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
  return setChanged(getEntityContext(this), this, trait);
};

// @ts-expect-error
Number.prototype.get = function (
  this: Entity,
  trait: Trait | RelationPair,
  out?: Record<string, unknown>
) {
  return getTrait(getEntityContext(this), this, trait, out);
};

// @ts-expect-error
Number.prototype.set = function (
  this: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged = true
) {
  setTrait(getEntityContext(this), this, trait, value, triggerChanged);
};

// @ts-expect-error
Number.prototype.onAdd = function (this: Entity, input: HookInput, callback: Subscriber<any>) {
  return subscribeEntityEvent(getEntityContext(this), this, 'addSubscriptions', input, callback);
};

// @ts-expect-error
Number.prototype.onRemove = function (this: Entity, input: HookInput, callback: Subscriber<any>) {
  return subscribeEntityEvent(getEntityContext(this), this, 'removeSubscriptions', input, callback);
};

// @ts-expect-error
Number.prototype.onChange = function (this: Entity, input: HookInput, callback: Subscriber<any>) {
  return subscribeEntityEvent(getEntityContext(this), this, 'changeSubscriptions', input, callback);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any> | Identifier) {
  if (isIdentifier(relation)) {
    const target = getIdentifierTarget(getEntityContext(this), this, relation);
    return target === undefined ? [] : [target];
  }
  return getRelationTargets(getEntityContext(this), relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any> | Identifier) {
  if (isIdentifier(relation)) return getIdentifierTarget(getEntityContext(this), this, relation);
  return getFirstRelationTarget(getEntityContext(this), relation, this);
};

//@ts-expect-error
Number.prototype.id = function (this: Entity) {
  return getEntityId(this);
};

// @ts-expect-error
Number.prototype.generation = function (this: Entity) {
  return getEntityGeneration(this);
};

//@ts-expect-error
Number.prototype.isAlive = function (this: Entity) {
  const eid = getEntityId(this);
  const owner = addressSpace.pageOwners[eid >>> 10];
  if (!owner) return false;
  const idx = owner.entityIndex;
  const denseIdx = idx.sparse[eid];
  if (denseIdx === undefined || denseIdx >= idx.aliveCount) return false;
  return idx.dense[denseIdx] === (this as unknown as number);
};
