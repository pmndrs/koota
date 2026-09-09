import {
  addTrait,
  destroyEntity,
  getEntityGeneration,
  getEntityId,
  getFirstRelationTarget,
  getRelationTargets,
  getTrait,
  removeTrait,
  setChanged,
  setTrait,
  universe,
} from '../../kernel';
import type { Relation, RelationPair } from '../relation/types';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { HookInput } from '../world/resolve-hook';
import { entityHas, getEntityContext, subscribeEntityEvent } from './entity';
import type { Entity } from './types';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
  return addTrait(getEntityContext(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: (Trait | RelationPair)[]) {
  return removeTrait(getEntityContext(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait | RelationPair) {
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
Number.prototype.get = function (this: Entity, trait: Trait | RelationPair) {
  return getTrait(getEntityContext(this), this, trait);
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
Number.prototype.onAdd = function (
  this: Entity,
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
) {
  return subscribeEntityEvent(getEntityContext(this), this, 'addSubscriptions', input, callback);
};

// @ts-expect-error
Number.prototype.onRemove = function (
  this: Entity,
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
) {
  return subscribeEntityEvent(getEntityContext(this), this, 'removeSubscriptions', input, callback);
};

// @ts-expect-error
Number.prototype.onChange = function (
  this: Entity,
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
) {
  return subscribeEntityEvent(getEntityContext(this), this, 'changeSubscriptions', input, callback);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
  return getRelationTargets(getEntityContext(this), relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
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
  const owner = universe.pageAllocator.pageOwners[eid >>> 10];
  if (!owner) return false;
  const idx = owner.entityIndex;
  const denseIdx = idx.sparse[eid];
  if (denseIdx === undefined || denseIdx >= idx.aliveCount) return false;
  return idx.dense[denseIdx] === (this as unknown as number);
};
