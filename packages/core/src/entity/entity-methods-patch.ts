// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { $internal } from '../common';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets } from '../relation/relation';
import { Relation } from '../relation/types';
import { addTrait, getStore, hasTrait, removeTrait } from '../trait/trait';
import { ConfigurableTrait, Trait } from '../trait/types';
import { destroyEntity, getEntityWorld } from './entity';
import { Entity } from './types';
import { getEntityId } from './utils/pack-entity';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
	return addTrait(getEntityWorld(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: Trait[]) {
	return removeTrait(getEntityWorld(this), this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait) {
	return hasTrait(getEntityWorld(this), this, trait);
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
Number.prototype.get = function (this: Entity, trait: Trait) {
	const world = getEntityWorld(this);

	const result = hasTrait(world, this, trait);
	if (!result) return undefined;

	const traitCtx = trait[$internal];
	return traitCtx.get(getEntityId(this), getStore(world, trait));
};

// @ts-expect-error
Number.prototype.set = function (this: Entity, trait: Trait, value: any, triggerChanged = true) {
	const ctx = trait[$internal];
	const world = getEntityWorld(this);
	const store = getStore(world, trait);
	const index = getEntityId(this);

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(ctx.get(index, store)));

	ctx.set(index, store, value);
	triggerChanged && setChanged(world, this, trait);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
	return getRelationTargets(getEntityWorld(this), relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
	return getRelationTargets(getEntityWorld(this), relation, this)[0];
};

//@ts-expect-error
Number.prototype.id = function (this: Entity) {
	return getEntityId(this);
};
