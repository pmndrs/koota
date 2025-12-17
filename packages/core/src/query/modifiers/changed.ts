import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { isRelation } from '../../relation/utils/is-relation';
import { hasTrait, registerTrait } from '../../trait/trait';
import { getTraitData, hasTraitData } from '../../trait/trait-data';
import type { Trait, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import type { World } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { checkQueryTrackingWithRelations } from '../utils/check-query-tracking-with-relations';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends TraitOrRelation[] = TraitOrRelation[]>(
		...inputs: T
	): Modifier<Trait[], `changed-${number}`> => {
		const traits = inputs.map((input) => (isRelation(input) ? input[$internal].trait : input));
		return createModifier(`changed-${id}`, id, traits);
	};
}

export function setChanged(world: World, entity: Entity, trait: Trait) {
	const ctx = world[$internal];

	// Early exit if the trait is not on the entity.
	if (!hasTrait(world, entity, trait)) return;

	// Register the trait if it's not already registered.
	if (!hasTraitData(ctx.traitInstances, trait)) registerTrait(world, trait);
	const data = getTraitData(ctx.traitInstances, trait)!;

	// Mark the trait as changed for the entity.
	// This is used for filling initial values for Changed modifiers.
	for (const changedMask of ctx.changedMasks.values()) {
		const eid = getEntityId(entity);
		const data = getTraitData(ctx.traitInstances, trait)!;
		const { generationId, bitflag } = data;

		// Ensure the generation array exists
		if (!changedMask[generationId]) {
			changedMask[generationId] = [];
		}

		// Ensure the entity mask exists
		if (!changedMask[generationId][eid]) {
			changedMask[generationId][eid] = 0;
		}

		// Set the bit for this trait
		changedMask[generationId][eid] |= bitflag;
	}

	// Update tracking queries with change event
	const { generationId, bitflag } = data;
	for (const query of data.trackingQueries) {
		// If the query has no changed modifiers, continue
		if (!query.hasChangedModifiers) continue;
		// If the trait is not part of a Changed modifier in this query, continue
		if (!query.changedTraits.has(trait)) continue;

		// Use checkQueryTrackingWithRelations if query has relation filters, otherwise use checkQueryTracking
		const match =
			query.relationFilters && query.relationFilters.length > 0
				? checkQueryTrackingWithRelations(
						world,
						query,
						entity,
						'change',
						generationId,
						bitflag
				  )
				: query.checkTracking(world, entity, 'change', generationId, bitflag);
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	for (const sub of data.changeSubscriptions) {
		sub(entity);
	}
}
