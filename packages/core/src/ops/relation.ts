import { $internal } from '../common';
import { Entity } from '../entity/types';
import { Pair, Wildcard, getRelationTargets } from '../relation/relation';
import { Relation } from '../relation/types';
import { registerTrait, hasTrait } from '../trait/trait';
import { Trait } from '../trait/types';
import { World } from '../world/world';
import { doAddTrait, doRemoveTrait } from './trait';

export function doAddRelation(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	target: Entity | typeof Wildcard,
	params?: Record<string, any>
) {
	const ctx = world[$internal];
	const pairTrait = Pair(relation, target);

	// Register the pair trait if not already registered.
	if (!ctx.traitData.has(pairTrait)) registerTrait(world, pairTrait);

	// Exit early if the entity already has this relation.
	if (hasTrait(world, entity, pairTrait)) return;

	// Mark entity as a relation target.
	ctx.relationTargetEntities.add(target);

	// Add the actual pair trait.
	doAddTrait(world, entity, pairTrait, params);

	// Add wildcard bookkeeping traits.
	const wildcardTargetTrait = Pair(Wildcard, target);
	const relationWildcardTrait = Pair(relation, Wildcard);

	if (!ctx.traitData.has(wildcardTargetTrait)) registerTrait(world, wildcardTargetTrait);
	if (!ctx.traitData.has(relationWildcardTrait)) registerTrait(world, relationWildcardTrait);

	if (!hasTrait(world, entity, wildcardTargetTrait)) {
		doAddTrait(world, entity, wildcardTargetTrait);
	}
	if (!hasTrait(world, entity, relationWildcardTrait)) {
		doAddTrait(world, entity, relationWildcardTrait);
	}

	// Handle exclusive relation logic.
	if (relation[$internal].exclusive === true && target !== Wildcard) {
		const oldTarget = getRelationTargets(world, relation, entity)[0] as
			| Entity
			| typeof Wildcard
			| undefined;

		if (oldTarget !== undefined && oldTarget !== target) {
			doRemoveRelation(world, entity, relation, oldTarget);
		}
	}
}

export function doRemoveRelation(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	target: Entity | typeof Wildcard
) {
	const ctx = world[$internal];
	const pairTrait = Pair(relation, target);

	// Exit early if the entity doesn't have this relation.
	if (!hasTrait(world, entity, pairTrait)) return;

	// Remove the actual pair trait.
	doRemoveTrait(world, entity, pairTrait);

	// Check if entity is still a subject of any relation to this target.
	if (world.query(Wildcard(target)).length === 0) {
		ctx.relationTargetEntities.delete(target);
	}

	// Remove wildcard to this target for this entity.
	const wildcardTargetTrait = Pair(Wildcard, target);
	if (hasTrait(world, entity, wildcardTargetTrait)) {
		doRemoveTrait(world, entity, wildcardTargetTrait);
	}

	// Remove wildcard relation if the entity has no other relations of this type.
	const otherTargets = getRelationTargets(world, relation, entity);
	if (otherTargets.length === 0) {
		const relationWildcardTrait = Pair(relation, Wildcard);
		if (hasTrait(world, entity, relationWildcardTrait)) {
			doRemoveTrait(world, entity, relationWildcardTrait);
		}
	}

	// Removing a relation with a wildcard target should also remove every target for that relation.
	if (target === Wildcard) {
		const targets = getRelationTargets(world, relation, entity) as readonly (
			| Entity
			| typeof Wildcard
		)[];
		for (const t of targets) {
			doRemoveRelation(world, entity, relation, t);
		}
	}
}
