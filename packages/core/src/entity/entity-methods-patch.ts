import { setChanged } from '../query/modifiers/changed';
import { getFirstRelationTarget, getRelationTargets, hasRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { destroyEntity, getEntityContext } from './entity';
import type { Entity } from './types';
import { getEntityGeneration, getEntityId } from './utils/pack-entity';
import { universe } from '../universe/universe';

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
    const ctx = getEntityContext(this);
    if (isRelationPair(trait)) return hasRelationPair(ctx, this, trait);
    return /* @inline @pure */ hasTrait(ctx, this, trait);
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
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    const allocator = universe.pageAllocator;
    const alive = allocator.alive[pageId];
    if (!alive) return false;
    if ((alive[offset >>> 5] & (1 << (offset & 31))) === 0) return false;
    return getEntityGeneration(this) === allocator.generations[pageId]![offset];
};
