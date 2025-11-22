import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets, Pair, Wildcard } from '../relation/relation';
import type { World } from '../world/world';
import type { Trait, TraitData } from './types';
import { getStore, hasTrait, registerTrait } from './trait';

export function getTraitById(world: World, traitId: number): Trait | undefined {
	const ctx = world[$internal];
	return ctx.traitById[traitId];
}

function executeAddTraitForTrait(world: World, entity: Entity, trait: Trait): void {
	const ctx = world[$internal];
	// Exit early if the entity already has the trait.
	if (hasTrait(world, entity, trait)) return;

	// Register the trait if it's not already registered.
	if (!ctx.traitData.has(trait)) registerTrait(world, trait);

	const traitCtx = trait[$internal];
	const data = ctx.traitData.get(trait)!;
	const { generationId, bitflag, queries } = data;

	// Add bitflag to entity bitmask.
	const eid = getEntityId(entity);
	if (!ctx.entityMasks[generationId]) ctx.entityMasks[generationId] = [];
	ctx.entityMasks[generationId][eid] |= bitflag;

	// Set the entity as dirty.
	for (const dirtyMask of ctx.dirtyMasks.values()) {
		if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
		dirtyMask[generationId][eid] |= bitflag;
	}

	// Update queries.
	for (const query of queries) {
		// Remove this entity from toRemove if it exists in this query.
		query.toRemove.remove(entity);

		// Check if the entity matches the query.
		const match = query.check(world, entity, { type: 'add', traitData: data });

		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Add trait to entity internally.
	let entityTraits = ctx.entityTraits.get(entity);
	if (!entityTraits) {
		entityTraits = new Set();
		ctx.entityTraits.set(entity, entityTraits);
	}
	entityTraits.add(trait);

	// Handle relation bookkeeping for pair traits.
	const relation = traitCtx.relation;
	const target = traitCtx.pairTarget;

	if (traitCtx.isPairTrait && relation !== null && target !== null) {
		// Mark entity as a relation target.
		ctx.relationTargetEntities.add(target);

		// Add wildcard relation traits.
		const wildcardTargetTrait = Pair(Wildcard, target);
		const wildcardRelationTrait = Pair(relation, Wildcard);

		executeAddTraitForTrait(world, entity, wildcardTargetTrait);
		executeAddTraitForTrait(world, entity, wildcardRelationTrait);

		// If it's an exclusive relation, remove the old target.
		if (relation[$internal].exclusive === true && target !== Wildcard) {
			const oldTarget = getRelationTargets(world, relation, entity)[0];

			if (oldTarget !== null && oldTarget !== undefined && oldTarget !== target) {
				const relationTrait = relation(oldTarget);
				executeRemoveTrait(world, entity, relationTrait[$internal].id);
			}
		}
	}
}

export function executeAddTraitMembership(world: World, entity: Entity, traitId: number): void {
	const trait = getTraitById(world, traitId);
	if (!trait) return;
	executeAddTraitForTrait(world, entity, trait);
}

export function executeFireAddSubscriptions(
	world: World,
	entity: Entity,
	traitId: number
): void {
	const ctx = world[$internal];
	const trait = getTraitById(world, traitId);
	if (!trait) return;

	const data = ctx.traitData.get(trait) as TraitData | undefined;
	if (!data) return;

	for (const sub of data.addSubscriptions) {
		sub(entity);
	}
}

function executeRemoveTraitForTrait(world: World, entity: Entity, trait: Trait): void {
	const ctx = world[$internal];
	const traitCtx = trait[$internal];

	// Exit early if the entity doesn't have the trait.
	if (!hasTrait(world, entity, trait)) return;

	const data = ctx.traitData.get(trait)!;
	const { generationId, bitflag, queries } = data;

	// Call remove subscriptions before removing the trait.
	for (const sub of data.removeSubscriptions) {
		sub(entity);
	}

	// Remove bitflag from entity bitmask.
	const eid = getEntityId(entity);
	ctx.entityMasks[generationId][eid] &= ~bitflag;

	// Set the entity as dirty.
	for (const dirtyMask of ctx.dirtyMasks.values()) {
		if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
		dirtyMask[generationId][eid] |= bitflag;
	}

	// Update queries.
	for (const query of queries) {
		// Check if the entity matches the query.
		const match = query.check(world, entity, { type: 'remove', traitData: data });

		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Remove trait from entity internally.
	const entityTraits = ctx.entityTraits.get(entity);
	if (entityTraits) {
		entityTraits.delete(trait);
	}

	// Remove wildcard relations if it is a Pair trait.
	if (traitCtx.isPairTrait) {
		// Check if entity is still a subject of any relation or not.
		if (world.query(Wildcard(entity)).length === 0) {
			ctx.relationTargetEntities.delete(entity);
		}

		// Remove wildcard to this target for this entity.
		const target = traitCtx.pairTarget!;
		const wildcardTargetTrait = Pair(Wildcard, target);
		executeRemoveTraitForTrait(world, entity, wildcardTargetTrait);

		// Remove wildcard relation if the entity has no other relations.
		const relation = traitCtx.relation!;
		const otherTargets = getRelationTargets(world, relation, entity);

		if (otherTargets.length === 0) {
			const wildcardRelationTrait = Pair(relation, Wildcard);
			executeRemoveTraitForTrait(world, entity, wildcardRelationTrait);
		}

		// Removing a relation with a wildcard should also remove every target for that relation.
		if (traitCtx.isPairTrait && traitCtx.pairTarget === Wildcard && traitCtx.relation !== Wildcard) {
			const relation = traitCtx.relation!;
			const targets = getRelationTargets(world, relation, entity);
			for (const t of targets) {
				const relTrait = relation(t);
				executeRemoveTraitForTrait(world, entity, relTrait);
			}
		}
	}
}

export function executeRemoveTrait(world: World, entity: Entity, traitId: number): void {
	const trait = getTraitById(world, traitId);
	if (!trait) return;
	executeRemoveTraitForTrait(world, entity, trait);
}

export function executeSetTrait(
	world: World,
	entity: Entity,
	traitId: number,
	value: unknown
): void {
	const trait = getTraitById(world, traitId);
	if (!trait) return;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	let nextValue = value;

	// If a callback is provided, call it with the previous state.
	if (typeof nextValue === 'function') {
		nextValue = (nextValue as (prev: any) => any)(traitCtx.get(index, store));
	}

	traitCtx.set(index, store, nextValue);
}

export function executeMarkTraitChanged(world: World, entity: Entity, traitId: number): void {
	const trait = getTraitById(world, traitId);
	if (!trait) return;

	setChanged(world, entity, trait);
}


