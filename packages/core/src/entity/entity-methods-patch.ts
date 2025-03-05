// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { addTrait, hasTrait, removeTrait } from '../trait/trait';
import { ConfigurableTrait, Trait } from '../trait/types';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets } from '../relation/relation';
import { Relation } from '../relation/types';
import { universe } from '../universe/universe';
import { $internal } from '../common';
import { destroyEntity } from './entity';
import { Entity } from './types';
import { ENTITY_ID_MASK, WORLD_ID_SHIFT } from './utils/pack-entity';
import { isEntityAlive } from './utils/entity-index';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return addTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: Trait[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return removeTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return hasTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return destroyEntity(world, this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return setChanged(world, this, trait);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	const worldCtx = world[$internal];
	// TODO: Remove the need for a map to get the entity mask for the trait.
	const data = worldCtx.traitData.get(trait);

	// If the trait does not exist on the world return undefined.
	if (!data) return undefined;

	// Get entity index/id.
	const index = this & ENTITY_ID_MASK;

	// If the entity does not have the trait return undefined.
	const mask = worldCtx.entityMasks[data.generationId][index];
	if ((mask & data.bitflag) !== data.bitflag) return undefined;

	// Return a snapshot of the trait state.
	const traitCtx = trait[$internal];
	const store = traitCtx.stores[worldId];
	return traitCtx.get(index, store);
};

// @ts-expect-error
Number.prototype.set = function (this: Entity, trait: Trait, value: any, triggerChanged = true) {
	const ctx = trait[$internal];
	const index = this & ENTITY_ID_MASK;
	const worldId = this >>> WORLD_ID_SHIFT;
	const store = ctx.stores[worldId];

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(ctx.get(index, store)));

	ctx.set(index, store, value);
	triggerChanged && setChanged(universe.worlds[worldId], this, trait);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return getRelationTargets(world, relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return getRelationTargets(world, relation, this)[0];
};

//@ts-expect-error
Number.prototype.id = function (this: Entity) {
	const id = this & ENTITY_ID_MASK;
	return id;
};

//@ts-expect-error
Number.prototype.isAlive = function (this: Entity) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return isEntityAlive(world[$internal].entityIndex, this);
};
