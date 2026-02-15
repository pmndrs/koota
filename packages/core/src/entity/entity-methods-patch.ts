// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { $internal } from '../common';
import { setChanged } from '../query/modifiers/changed';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from '../trait/trait';
import { getFirstRelationTarget, getRelationTargets, hasPair } from '../trait/relation';
import { isPair } from '../trait/utils/is-relation';
import type { ConfigurableTrait, Relation, RelationPair, Trait } from '../trait/types';
import { destroyEntity, getEntityWorld } from './entity';
import type { Entity } from './types';
import { isEntityAlive } from './utils/entity-index';
import { getEntityGeneration, getEntityId } from './utils/pack-entity';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
    return addTrait(getEntityWorld(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: (Trait | RelationPair)[]) {
    return removeTrait(getEntityWorld(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait | RelationPair) {
    const world = getEntityWorld(this);
    if (isPair(trait)) return hasPair(world, this, trait);
    return hasTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
    return destroyEntity(getEntityWorld(this), this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
    return setChanged(getEntityWorld(this), this, trait);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, trait: Trait | RelationPair) {
    return getTrait(getEntityWorld(this), this, trait);
};

// @ts-expect-error
Number.prototype.set = function (
    this: Entity,
    trait: Trait | RelationPair,
    value: any,
    triggerChanged = true
) {
    setTrait(getEntityWorld(this), this, trait, value, triggerChanged);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
    return getRelationTargets(getEntityWorld(this), relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
    return getFirstRelationTarget(getEntityWorld(this), relation, this);
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
    const world = getEntityWorld(this);
    const entityIndex = world[$internal].entityIndex;
    return isEntityAlive(entityIndex, this);
};
