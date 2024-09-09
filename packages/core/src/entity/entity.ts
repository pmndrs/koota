import { addComponent, hasComponent, removeComponent } from '../component/component';
import { $isPairComponent, $pairTarget, $relation } from '../component/symbols';
import { Component, ComponentOrWithParams } from '../component/types';
import { Pair, Wildcard } from '../relation/relation';
import { $autoRemoveTarget } from '../relation/symbols';
import { universe } from '../universe/universe';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { Entity } from './types';
import { allocateEntity, releaseEntity } from './utils/entity-index';
import { getEntityWorldId } from './utils/pack-entity';

export function createEntity(world: World, ...components: ComponentOrWithParams[]): Entity {
	const ctx = world[$internal];
	const entity = allocateEntity(ctx.entityIndex);

	for (const query of ctx.notQueries) {
		const match = query.check(world, entity);
		if (match) query.add(entity);
	}

	ctx.entityComponents.set(entity, new Set());

	// Add components.
	entity.add(...components);

	return entity;
}

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function destroyEntity(world: World, entity: Entity) {
	const ctx = world[$internal];

	// Check if entity exists.
	if (!world.has(entity)) return;

	// Caching the lookup in the outer scope of the loop increases performance.
	const entityQueue = cachedQueue;
	const processedEntities = cachedSet;

	// Ensure the queue is empty before starting.
	entityQueue.length = 0;
	entityQueue.push(entity);

	// Destroyed entities may be the target of relations.
	// To avoid stale references, all these relations must be removed.
	// In addition, if the relation has the autoRemoveTarget flag set,
	// the target entity should also be destroyed, for example children relations.
	while (entityQueue.length > 0) {
		const currentEid = entityQueue.pop()!;
		if (processedEntities.has(currentEid)) continue;
		processedEntities.add(currentEid);

		// Process all related entities and components.
		for (const subject of world.query(Wildcard(currentEid))) {
			if (!world.has(subject)) continue;

			for (const component of ctx.entityComponents.get(subject)!) {
				if (!component[$isPairComponent]) continue;

				const relation = component[$relation];

				// Remove wildcard pair component.
				removeComponent(world, subject, Pair(Wildcard, currentEid));

				if (component[$pairTarget] === currentEid) {
					// Remove the specific pair component.
					removeComponent(world, subject, component);

					if (relation[$autoRemoveTarget]) {
						entityQueue.push(subject);
					}
				}
			}
		}

		// Remove all components of the current entity.
		const entityComponents = ctx.entityComponents.get(currentEid);
		if (entityComponents) {
			for (const component of entityComponents) {
				removeComponent(world, currentEid, component);
			}
		}

		// Free the entity.
		releaseEntity(ctx.entityIndex, currentEid);

		// Remove all entity state from world.
		ctx.entityComponents.delete(entity);

		// Clear entity bitmasks.
		for (let i = 0; i < ctx.entityMasks.length; i++) {
			ctx.entityMasks[i][entity] = 0;
		}
	}
}

// Add methods to the Number prototype for convenience.
// @ts-expect-error
Number.prototype.add = function (this: Entity, ...components: ComponentOrWithParams[]) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return addComponent(world, this, ...components);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...components: Component[]) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return removeComponent(world, this, ...components);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, component: Component) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return hasComponent(world, this, component);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
	const worldId = getEntityWorldId(this);
	const world = universe.worlds[worldId];
	return destroyEntity(world, this);
};
