import { TraitData } from '../../trait/trait-data';
import { Trait } from '../../trait/types';
import { Entity } from '../../entity/types';
import { universe } from '../../universe/universe';
import { $internal } from '../../common';
import { World } from '../../world/world';
import { ModifierData } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';
import { getEntityId } from '../../entity/utils/pack-entity';

export function createChanged() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends Trait[] = Trait[]>(...traits: T) =>
		new ModifierData<T>(`changed-${id}`, id, traits);
}

export function setChanged(world: World, entity: Entity, trait: Trait) {
	const ctx = world[$internal];

	// Early exit if the trait is not on the entity.
	if (!entity.has(trait)) return;

	let data = ctx.traitData.get(trait)!;

	if (!data) {
		data = new TraitData(world, trait);
		ctx.traitData.set(trait, data);
	}

	for (const changedMask of ctx.changedMasks.values()) {
		const eid = getEntityId(entity);
		if (!changedMask[eid]) changedMask[eid] = new Array();
		const traitId = trait[$internal].id;
		changedMask[eid][traitId] = 1;
	}

	// Update queries.
	for (const query of data.queries) {
		// Check if the entity matches the query.
		let match = query.check(world, entity, { type: 'change', traitData: data });

		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	for (const sub of data.changedSubscriptions) {
		sub(entity);
	}
}
