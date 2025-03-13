import { Relation } from '../relation/types';
import { addTrait, getTrait, removeTrait } from '../trait/trait';
import { ConfigurableTrait, ExtractSchema, Trait, TraitInstance } from '../trait/types';
import { Universe } from '../universe/universe';
import { Entity } from './types';
import { WORLD_ID_SHIFT } from './utils/pack-entity';

export function createAdd(universe: Universe) {
	return function add(this: Entity, ...traits: ConfigurableTrait[]) {
		const worldId = this >>> WORLD_ID_SHIFT;
		const world = universe.worlds[worldId];
		return addTrait(world, this, ...traits);
	};
}

export function createRemove(universe: Universe) {
	return function (this: Entity, ...traits: Trait[]) {
		const worldId = this >>> WORLD_ID_SHIFT;
		const world = universe.worlds[worldId];
		return removeTrait(world, this, ...traits);
	};
}

export function createGet(universe: Universe) {
	return function <T extends Trait | Relation<Trait>>(
		this: Entity,
		trait: T
	): TraitInstance<ExtractSchema<T>> | undefined {
		const worldId = this >>> WORLD_ID_SHIFT;
		const world = universe.worlds[worldId];
		return getTrait(world, this, trait as Trait);
	};
}
