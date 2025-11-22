import { $internal } from '../common';
import { addTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import { universe } from '../universe/universe';
import { cmdDestroyEntity, cmdSpawnEntity } from '../world/command-buffer';
import { flushCommands } from '../world/command-runtime';
import type { World } from '../world/world';
import type { Entity } from './types';
import { allocateEntity } from './utils/entity-index';
import { getEntityWorldId } from './utils/pack-entity';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(world: World, ...traits: ConfigurableTrait[]): Entity {
	const ctx = world[$internal];
	const entity = allocateEntity(ctx.entityIndex);

	const buf = ctx.commandBuffer;

	// Record a spawn command for this entity and flush to apply it synchronously.
	if (buf) {
		cmdSpawnEntity(buf, entity);
		flushCommands(world);
	}

	// Add initial traits via the public API, which will decompose into commands.
	if (traits.length > 0) {
		addTrait(world, entity, ...traits);
	}

	return entity;
}

export function destroyEntity(world: World, entity: Entity) {
	const ctx = world[$internal];

	// Check if entity exists.
	if (!world.has(entity)) throw new Error('Koota: The entity being destroyed does not exist.');

	const buf = ctx.commandBuffer;
	if (!buf) return;

	cmdDestroyEntity(buf, entity);
	flushCommands(world);
}

/* @inline @pure */ export function getEntityWorld(entity: Entity) {
	const worldId = getEntityWorldId(entity);
	return universe.worlds[worldId]!;
}
