// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { $internal } from '../common';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets } from '../relation/relation';
import type { Relation } from '../relation/types';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { universe } from '../universe/universe';
import { destroyEntity } from './entity';
import type { Entity } from './types';
import { isEntityAlive } from './utils/entity-index';
import { getEntityGeneration, getEntityId, WORLD_ID_SHIFT } from './utils/pack-entity';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return addTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: Trait[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return removeTrait(world, this, ...traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return hasTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return destroyEntity(world, this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return setChanged(world, this, trait);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, trait: Trait) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return getTrait(world, this, trait);
};

// @ts-expect-error
Number.prototype.set = function (this: Entity, trait: Trait, value: any, triggerChanged = true) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	setTrait(world, this, trait, value, triggerChanged);
};

//@ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<any>) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return getRelationTargets(world, relation, this);
};

//@ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<any>) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return getRelationTargets(world, relation, this)[0];
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
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId]!.deref()!;
	return isEntityAlive(world[$internal].entityIndex, this);
};
