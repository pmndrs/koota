// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { $internal } from '../common';
import { setChanged } from '../query/modifiers/changed';
import { getFirstRelationTarget, getRelationTargets, hasRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { strictAssert } from '../strict';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { destroyEntity, getEntityWorld } from './entity';
import type { Entity } from './types';
import { isEntityAlive } from './utils/entity-index';
import { getEntityGeneration, getEntityId } from './utils/pack-entity';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot add traits to a dead entity.'
    );
    return addTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: (Trait | RelationPair)[]) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot remove traits from a dead entity.'
    );
    return removeTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait | RelationPair) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot check traits on a dead entity.'
    );
    if (isRelationPair(trait)) return hasRelationPair(world, this, trait);
    return /* @inline @pure */ hasTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
    return destroyEntity(getEntityWorld(this), this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot mark trait as changed on a dead entity.'
    );
    strictAssert(
        hasTrait(world, this, trait),
        'Cannot mark trait as changed when entity does not have it.'
    );
    return setChanged(world, this, trait);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, trait: Trait | RelationPair) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot get trait from a dead entity.'
    );
    return getTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.set = function (
    this: Entity,
    trait: Trait | RelationPair,
    value: any,
    triggerChanged = true
) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot set trait on a dead entity.'
    );
    setTrait(world, this, trait, value, triggerChanged);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot get relation targets from a dead entity.'
    );
    return getRelationTargets(world, relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
    const world = getEntityWorld(this);
    strictAssert(
        isEntityAlive(world[$internal].entityIndex, this),
        'Cannot get relation target from a dead entity.'
    );
    return getFirstRelationTarget(world, relation, this);
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
