import { removeComponent } from '../component/component';
import { $isPairComponent, $pairTarget, $relation } from '../component/symbols';
import { ComponentOrWithParams } from '../component/types';
import { Pair, Wildcard } from '../relation/relation';
import { $autoRemoveTarget } from '../relation/symbols';
import {
	$entityComponents,
	$entityCursor,
	$entityMasks,
	$entitySparseSet,
	$notQueries,
	$recyclingBin,
	$relationTargetEntities,
	$removed,
} from '../world/symbols';
import { World } from '../world/world';

export function createEntity(world: World, ...components: ComponentOrWithParams[]): number {
	let entity: number;

	// Recycle an entity if possible.
	if (world[$removed].length > 0) {
		entity = world[$removed].dequeue();
	} else {
		entity = world[$entityCursor]++;
	}

	// Add entity to the world.
	world[$entitySparseSet].add(entity);

	for (const query of world[$notQueries]) {
		const match = query.check(world, entity);
		if (match) query.add(entity);
	}

	world[$entityComponents].set(entity, new Set());

	// Add components.
	world.add(entity, ...components);

	return entity;
}

export function destroyEntity(world: World, entity: number) {
	// Check if entity exists.
	if (!world[$entitySparseSet].has(entity)) return;

	// Remove relation components from entities that have a relation to this one.
	// For example with children.

	// Check to see if this entity is a relation target at all.
	if (world[$relationTargetEntities].has(entity)) {
		// If it is, iterate over all subjects with any relation to this entity.
		for (const subject of world.query(Wildcard(entity))) {
			const subjectExists = world[$entitySparseSet].has(subject);

			// TODO: can we avoid this check? (subject may have been removed already)
			if (!subjectExists) continue;

			// Remove the wildcard association with the subject for this entity.
			removeComponent(world, subject, Pair(Wildcard, entity));

			// Iterate all relations that the subject has to this entity.
			for (const component of world[$entityComponents].get(subject)!) {
				// TODO: Can we avoid this check? (subject may have been removed by this loop already)
				if (!component[$isPairComponent] || !subjectExists) {
					continue;
				}
				const relation = component[$relation]!;

				if (component[$pairTarget] === entity) {
					if (relation[$autoRemoveTarget]) {
						destroyEntity(world, subject);
					} else {
						removeComponent(world, subject, component);
					}
					// if (relation[$onTargetRemoved]) {
					// 	relation[$onTargetRemoved](world, subject, eid);
					// }
				}
			}
		}
	}

	// Remove all components.
	for (const component of world[$entityComponents].get(entity)!) {
		removeComponent(world, entity, component);
	}

	// for (const query of world[$queries]) {
	// 	query.remove(world, entity);
	// }

	// Recycle the entity.
	world[$recyclingBin].push(entity);
	world[$entitySparseSet].remove(entity);
	world[$entityComponents].delete(entity);

	// Clear entity bitmasks.
	for (let i = 0; i < world[$entityMasks].length; i++) world[$entityMasks][i][entity] = 0;
}
