import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { hasTrait, registerTrait } from '../../trait/trait';
import type { Trait } from '../../trait/types';
import { universe } from '../../universe/universe';
import type { World } from '../../world/world';
import { createModifier } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends Trait[] = Trait[]>(...traits: T) => {
		return createModifier(`changed-${id}`, id, traits);
	};
}

export function setChanged(world: World, entity: Entity, trait: Trait) {
	const ctx = world[$internal];

	// Early exit if the trait is not on the entity.
	if (!hasTrait(world, entity, trait)) return;

	// Register the trait if it's not already registered.
	if (!ctx.traitData.has(trait)) registerTrait(world, trait);
	const data = ctx.traitData.get(trait)!;

	// Mark the trait as changed for the entity.
	// This is used for filling initial values for Changed modifiers.
	for (const changedMask of ctx.changedMasks.values()) {
		const eid = getEntityId(entity);
		if (!changedMask[eid]) changedMask[eid] = [];
		const traitId = trait[$internal].id;
		changedMask[eid][traitId] = 1;
	}

	// Update queries.
	for (const query of data.queries) {
		// If the query has no changed modifiers, continue.
		if (!query.hasChangedModifiers) continue;
		// If the trait is not part of a Changed modifier in this query, continue.
		if (!query.changedTraits.has(trait)) continue;

		// Check if the entity matches the query.
		const match = query.check(world, entity, { type: 'change', traitData: data });

		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	for (const sub of data.changeSubscriptions) {
		sub(entity);
	}
}
