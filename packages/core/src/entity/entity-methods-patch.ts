// @ts-nocheck

// Add methods to the Number prototype so it can be used as an entity.
// This lets us keep the performance of raw numbers over using objects
// and the convenience of using methods. Type guards are used to ensure
// that the methods are only called on entities.

import { addComponent, removeComponent, hasComponent } from '../component/component';
import { setChanged } from '../query/modifiers/changed';
import { universe } from '../universe/universe';
import { destroyEntity } from './entity';
import { getEntityWorldId } from './utils/pack-entity';

Number.prototype.add = function (this: Entity, ...components: ComponentOrWithParams[]) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return addComponent(world, this, ...components);
};

Number.prototype.remove = function (this: Entity, ...components: Component[]) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return removeComponent(world, this, ...components);
};

Number.prototype.has = function (this: Entity, component: Component) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return hasComponent(world, this, component);
};

Number.prototype.destroy = function (this: Entity) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return destroyEntity(world, this);
};

Number.prototype.changed = function (this: Entity, component: Component) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return setChanged(world, this, component);
};
