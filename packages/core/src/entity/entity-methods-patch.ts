// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { addComponent, hasComponent, removeComponent } from '../component/component';
import { Component, ComponentOrWithParams } from '../component/types';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets } from '../relation/relation';
import { Relation, RelationTarget } from '../relation/types';
import { universe } from '../universe/universe';
import { $internal } from '../world/symbols';
import { destroyEntity } from './entity';
import { Entity } from './types';
import { ENTITY_ID_MASK, WORLD_ID_SHIFT } from './utils/pack-entity';

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...components: ComponentOrWithParams[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return addComponent(world, this, ...components);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...components: Component[]) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return removeComponent(world, this, ...components);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, component: Component) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return hasComponent(world, this, component);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return destroyEntity(world, this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, component: Component) {
	const worldId = this >>> WORLD_ID_SHIFT;
	const world = universe.worlds[worldId];
	return setChanged(world, this, component);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, component: Component) {
	const ctx = component[$internal];
	const index = this & ENTITY_ID_MASK;
	const worldId = this >>> WORLD_ID_SHIFT;
	const store = ctx.stores[worldId];
	return ctx.get(index, store);
};

// @ts-expect-error
Number.prototype.set = function (this: Entity, component: Component, value: any, flagChanged = true) {
	const ctx = component[$internal];
	const index = this & ENTITY_ID_MASK;
	const worldId = this >>> WORLD_ID_SHIFT;
	const store = ctx.stores[worldId];
	// flagChanged && setChanged(universe.worlds[worldId], this, component);
	return ctx.set(index, store, value);
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
