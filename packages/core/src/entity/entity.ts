import { addTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import { universe } from '../universe/universe';
import type { World } from '../world/world';
import { doCreateEntity, doDestroyEntity } from '../ops/entity';
import type { Entity } from './types';
import { getEntityWorldId } from './utils/pack-entity';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(world: World, ...traits: ConfigurableTrait[]): Entity {
	const entity = /* @inline */ doCreateEntity(world);
	addTrait(world, entity, ...traits);
	return entity;
}

export function destroyEntity(world: World, entity: Entity) {
	if (!world.has(entity)) throw new Error('Koota: The entity being destroyed does not exist.');
	/* @inline */ doDestroyEntity(world, entity);
}

/* @inline @pure */ export function getEntityWorld(entity: Entity) {
	const worldId = getEntityWorldId(entity);
	return universe.worlds[worldId]!;
}
