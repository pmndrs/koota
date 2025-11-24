import { $internal } from '../common';
import { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import { Pair, Wildcard, getRelationTargets } from '../relation/relation';
import { addTrait, removeTrait } from '../trait/trait';
import { Trait } from '../trait/types';
import { getStore } from '../trait/utils/get-store';
import { World } from '../world/world';

export function doAddAndSetTrait(
	world: World,
	entity: Entity,
	trait: Trait,
	params?: Record<string, any>
) {
	const ctx = world[$internal];
	const traitCtx = trait[$internal];
	const data = ctx.traitData.get(trait)!;
	const { generationId, bitflag, queries } = data;

	// Add bitflag to entity bitmask.
	const eid = getEntityId(entity);
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
	ctx.entityTraits.get(entity)!.add(trait);

	const relation = traitCtx.relation;
	const target = traitCtx.pairTarget;

	// Add relation target entity.
	if (traitCtx.isPairTrait && relation !== null && target !== null) {
		// Mark entity as a relation target.
		ctx.relationTargetEntities.add(target);

		// Add wildcard relation traits.
		addTrait(world, entity, Pair(Wildcard, target));
		addTrait(world, entity, Pair(relation, Wildcard));

		// If it's an exclusive relation, remove the old target.
		if (relation[$internal].exclusive === true && target !== Wildcard) {
			const oldTarget = getRelationTargets(world, relation, entity)[0];

			if (oldTarget !== null && oldTarget !== undefined && oldTarget !== target) {
				doRemoveTrait(world, entity, relation(oldTarget));
			}
		}
	}

	if (traitCtx.type === 'soa') {
		// Set default values or override with provided params.
		const defaults: Record<string, any> = {};
		// Execute any functions in the schema for default values.
		for (const key in data.schema) {
			if (typeof data.schema[key] === 'function') {
				defaults[key] = data.schema[key]();
			} else {
				defaults[key] = data.schema[key];
			}
		}

		doSetTrait(world, entity, trait, { ...defaults, ...params }, false);
	} else {
		const state = params ?? data.schema();
		doSetTrait(world, entity, trait, state, false);
	}

	// Call add subscriptions.
	for (const sub of data.addSubscriptions) {
		sub(entity);
	}
}

export function doAddTrait(world: World, entity: Entity, trait: Trait) {
	doAddAndSetTrait(world, entity, trait);
}

export function doRemoveTrait(world: World, entity: Entity, trait: Trait) {
	const ctx = world[$internal];
	const traitCtx = trait[$internal];
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
	ctx.entityTraits.get(entity)!.delete(trait);

	// Remove wildcard relations if it is a Pair trait.
	if (traitCtx.isPairTrait) {
		// Check if entity is still a subject of any relation or not.
		if (world.query(Wildcard(entity)).length === 0) {
			ctx.relationTargetEntities.delete(entity);
		}

		// Remove wildcard to this target for this entity.
		const target = traitCtx.pairTarget!;
		removeTrait(world, entity, Pair(Wildcard, target));

		// Remove wildcard relation if the entity has no other relations.
		const relation = traitCtx.relation!;
		const otherTargets = getRelationTargets(world, relation, entity);

		if (otherTargets.length === 0) {
			removeTrait(world, entity, Pair(relation, Wildcard));
		}

		// Removing a relation with a wildcard should also remove every target for that relation.
		if (
			traitCtx.isPairTrait &&
			traitCtx.pairTarget === Wildcard &&
			traitCtx.relation !== Wildcard
		) {
			const relation = traitCtx.relation!;
			const targets = getRelationTargets(world, relation, entity);
			for (const target of targets) {
				removeTrait(world, entity, relation(target));
			}
		}
	}
}

export function doSetTrait(
	world: World,
	entity: Entity,
	trait: Trait,
	value: any,
	triggerChanged: boolean
) {
	const ctx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	ctx.set(index, store, value);
	triggerChanged && setChanged(world, entity, trait);
}
