import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { checkQueryTrackingWithRelations } from '../query/utils/check-query-tracking-with-relations';
import {
	addRelationTarget,
	getRelationData,
	getRelationTargets,
	hasRelationPair,
	hasRelationToTarget,
	isPairConfig,
	isRelationPair,
	removeAllRelationTargets,
	removeRelationTarget,
	setRelationData,
	setRelationDataAtIndex,
} from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { getTraitData, hasTraitData, setTraitData } from './utils/trait-data';
import type { World } from '../world/world';
import type {
	ConfigurableTrait,
	ExtractStore,
	Norm,
	Schema,
	Store,
	TagTrait,
	Trait,
	TraitData,
	TraitType,
	TraitValue,
} from './types';
import {
	createFastSetChangeFunction,
	createFastSetFunction,
	createGetFunction,
	createSetFunction,
} from './utils/create-accessors';
import { createStore } from './utils/create-store';
import { getSchemaDefaults } from './utils/get-schema-defaults';
import { validateSchema } from './utils/validate-schema';

// No reason to create a new object every time a tag trait is created.
const tagSchema = Object.freeze({});
let traitId = 0;

function defineTrait(schema?: undefined | Record<string, never>): TagTrait;
function defineTrait<S extends Schema>(schema: S): Trait<Norm<S>>;
function defineTrait<S extends Schema>(schema: S = tagSchema as S): Trait<Norm<S>> {
	const isAoS = typeof schema === 'function';
	const traitType: TraitType = isAoS ? 'aos' : 'soa';

	validateSchema(schema);

	const Trait = Object.assign((params: TraitValue<Norm<S>>) => [Trait, params], {
		schema: schema as Norm<S>,
		[$internal]: {
			set: createSetFunction[traitType](schema),
			fastSet: createFastSetFunction[traitType](schema),
			fastSetWithChangeDetection: createFastSetChangeFunction[traitType](schema),
			get: createGetFunction[traitType](schema),
			stores: [] as Store<S>[],
			id: traitId++,
			createStore: () => createStore(schema as Norm<S>),
			relation: null,
			isTag: !isAoS && Object.keys(schema).length === 0,
			type: traitType,
		},
	}) as Trait<Norm<S>>;

	return Trait;
}

export const trait = defineTrait;

export function registerTrait(world: World, trait: Trait) {
	const ctx = world[$internal];
	const traitCtx = trait[$internal];

	const data: TraitData = {
		generationId: ctx.entityMasks.length - 1,
		bitflag: ctx.bitflag,
		trait,
		store: traitCtx.createStore(),
		queries: new Set(),
		trackingQueries: new Set(),
		notQueries: new Set(),
		relationQueries: new Set(),
		schema: trait.schema,
		changeSubscriptions: new Set(),
		addSubscriptions: new Set(),
		removeSubscriptions: new Set(),
	};

	// Bind a reference to the store on the trait for direct access in queries.
	traitCtx.stores[world.id] = data.store;

	// Add trait to the world.
	setTraitData(ctx.traitData, trait, data);
	world.traits.add(trait);

	// Track relations
	if (traitCtx.relation) ctx.relations.add(traitCtx.relation);

	// Increment the bitflag used for the trait.
	incrementWorldBitflag(world);
}

export function addTrait(world: World, entity: Entity, ...traits: ConfigurableTrait[]) {
	for (let i = 0; i < traits.length; i++) {
		const config = traits[i];

		// Handle relation pairs
		if (isPairConfig(config)) {
			addRelationPair(world, entity, config);
			continue;
		}

		// Get trait and params for regular traits
		let trait: Trait;
		let params: Record<string, any> | undefined;

		if (Array.isArray(config)) {
			[trait, params] = config as [Trait, Record<string, any>];
		} else {
			trait = config as Trait;
		}

		// Add the trait to the entity
		const data = addTraitToEntity(world, entity, trait);
		if (!data) continue; // Already had the trait

		// Initialize values
		const traitCtx = trait[$internal];
		const defaults = getSchemaDefaults(data.schema, traitCtx.type);

		if (traitCtx.type === 'aos') {
			// AoS: use params or defaults directly (no spreading to preserve reference)
			setTrait(world, entity, trait, params ?? defaults, false);
		} else if (defaults) {
			setTrait(world, entity, trait, { ...defaults, ...params }, false);
		} else if (params) {
			setTrait(world, entity, trait, params, false);
		}

		// Call add subscriptions after values are set
		for (const sub of data.addSubscriptions) sub(entity);
	}
}

/**
 * Add a relation pair to an entity.
 */
/* @inline */ function addRelationPair(world: World, entity: Entity, pair: RelationPair) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;

	// Only specific targets can be added (not wildcard '*')
	if (typeof target !== 'number') return;

	const params = pairCtx.params;
	const relationCtx = relation[$internal];
	const relationTrait = relationCtx.trait;

	// Ignore if entity already relates to this target
	// For example, adding Likes(alice) when this pair is already on the entity.
	if (hasRelationToTarget(world, relation, entity, target)) return;

	// For exclusive relations, remove the old target first
	if (relationCtx.exclusive) {
		const oldTargets = getRelationTargets(world, relation, entity);
		if (oldTargets.length > 0 && oldTargets[0] !== target) {
			removeRelationTarget(world, relation, entity, oldTargets[0]);
		}
	}

	// Add the relation trait (ie. Likes)
	// Returns undefined if the trait was already added, such as multiple targets
	const data = addTraitToEntity(world, entity, relationTrait);

	// Add the target and initialize data
	const targetIndex = addRelationTarget(world, relation, entity, target);
	const schema = data?.schema ?? getTraitData(world[$internal].traitData, relationTrait)!.schema;
	const defaults = getSchemaDefaults(schema, relationTrait[$internal].type);

	if (defaults) {
		setRelationDataAtIndex(world, entity, relation, targetIndex, { ...defaults, ...params });
	} else if (params) {
		setRelationDataAtIndex(world, entity, relation, targetIndex, params);
	}

	// Call add subscriptions after values are set
	if (data) for (const sub of data.addSubscriptions) sub(entity);
}

export function removeTrait(world: World, entity: Entity, ...traits: (Trait | RelationPair)[]) {
	for (let i = 0; i < traits.length; i++) {
		const trait = traits[i];

		// Handle relation pairs
		if (isRelationPair(trait)) {
			removeRelationPair(world, entity, trait);
			continue;
		}

		// Exit early if the entity doesn't have the trait.
		if (!hasTrait(world, entity, trait)) continue;

		// If this trait belongs to a relation, clean up all targets first
		const traitCtx = trait[$internal];
		if (traitCtx.relation) {
			removeAllRelationTargets(world, traitCtx.relation, entity);
		}

		// Remove the trait from the entity
		removeTraitFromEntity(world, entity, trait);
	}
}

/**
 * Remove a relation pair from an entity.
 */
function removeRelationPair(world: World, entity: Entity, pair: RelationPair) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;

	const baseTrait = relation[$internal].trait;

	// Check if entity has this relation
	if (!hasTrait(world, entity, baseTrait)) return;

	// Handle wildcard target - remove all targets
	if (target === '*') {
		removeAllRelationTargets(world, relation, entity);
		removeTraitFromEntity(world, entity, baseTrait);
		return;
	}

	// Remove specific target
	if (typeof target === 'number') {
		const removedIndex = removeRelationTarget(world, relation, entity, target);
		if (removedIndex === -1) return;

		// If no targets remain, remove the base trait
		const remainingTargets = getRelationTargets(world, relation, entity);
		if (remainingTargets.length === 0) {
			removeTraitFromEntity(world, entity, baseTrait);
		}
	}
}

export function hasTrait(world: World, entity: Entity, trait: Trait): boolean {
	const ctx = world[$internal];
	const data = getTraitData(ctx.traitData, trait);
	if (!data) return false;

	const { generationId, bitflag } = data;
	const eid = getEntityId(entity);
	const mask = ctx.entityMasks[generationId][eid];

	return (mask & bitflag) === bitflag;
}

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
	world: World,
	trait: C
): ExtractStore<C> {
	const ctx = world[$internal];
	const data = getTraitData(ctx.traitData, trait)!;
	return data.store as ExtractStore<C>;
}

export function setTrait(
	world: World,
	entity: Entity,
	trait: Trait | RelationPair,
	value: any,
	triggerChanged = true
) {
	if (isRelationPair(trait)) return setTraitForPair(world, entity, trait, value, triggerChanged);
	return setTraitForTrait(world, entity, trait, value, triggerChanged);
}

export function getTrait(world: World, entity: Entity, trait: Trait | RelationPair) {
	if (isRelationPair(trait)) return getTraitForPair(world, entity, trait);
	return getTraitForTrait(world, entity, trait);
}

/**
 * Get trait data for a relation pair.
 */
/* @inline @pure */ function getTraitForPair(world: World, entity: Entity, pair: RelationPair) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation as Relation<Trait>;
	const target = pairCtx.target;

	if (!hasRelationPair(world, entity, pair)) return undefined;
	if (typeof target !== 'number') return undefined;

	return getRelationData(world, entity, relation, target);
}

/**
 * Get trait data for a regular trait.
 */
/* @inline @pure */ function getTraitForTrait(world: World, entity: Entity, trait: Trait) {
	if (!hasTrait(world, entity, trait)) return undefined;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	return traitCtx.get(getEntityId(entity), store);
}

/**
 * Set trait data for a relation pair.
 */
/* @inline */ function setTraitForPair(
	world: World,
	entity: Entity,
	pair: RelationPair,
	value: any,
	triggerChanged: boolean
) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation as Relation<Trait>;
	const target = pairCtx.target;

	if (typeof target !== 'number') return;

	setRelationData(world, entity, relation, target, value);
	if (triggerChanged) {
		setChanged(world, entity, relation[$internal].trait);
	}
}

/**
 * Set trait data for a regular trait.
 */
/* @inline */ function setTraitForTrait(
	world: World,
	entity: Entity,
	trait: Trait,
	value: any,
	triggerChanged: boolean
) {
	const ctx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(ctx.get(index, store)));

	ctx.set(index, store, value);
	triggerChanged && setChanged(world, entity, trait);
}

/**
 * Core logic for adding a trait to an entity.
 */
/* @inline */ function addTraitToEntity(
	world: World,
	entity: Entity,
	trait: Trait
): TraitData | undefined {
	// Exit early if the entity already has the trait
	if (hasTrait(world, entity, trait)) return undefined;

	const ctx = world[$internal];

	// Register the trait if it's not already registered
	if (!hasTraitData(ctx.traitData, trait)) registerTrait(world, trait);

	const data = getTraitData(ctx.traitData, trait)!;
	const { generationId, bitflag, queries, trackingQueries } = data;

	// Add bitflag to entity bitmask
	const eid = getEntityId(entity);
	ctx.entityMasks[generationId][eid] |= bitflag;

	// Set the entity as dirty
	for (const dirtyMask of ctx.dirtyMasks.values()) {
		if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
		dirtyMask[generationId][eid] |= bitflag;
	}

	// Update non-tracking queries (no event data needed)
	for (const query of queries) {
		query.toRemove.remove(entity);
		// Use checkQueryWithRelations if query has relation filters, otherwise use checkQuery
		const match =
			query.relationFilters && query.relationFilters.length > 0
				? checkQueryWithRelations(world, query, entity)
				: query.check(world, entity);
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Update tracking queries (with event data)
	for (const query of trackingQueries) {
		query.toRemove.remove(entity);
		// Use checkQueryTrackingWithRelations if query has relation filters, otherwise use checkQueryTracking
		const match =
			query.relationFilters && query.relationFilters.length > 0
				? checkQueryTrackingWithRelations(world, query, entity, 'add', generationId, bitflag)
				: query.checkTracking(world, entity, 'add', generationId, bitflag);
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Add trait to entity internally
	ctx.entityTraits.get(entity)!.add(trait);

	return data;
}

/**
 * Core logic for removing a trait from an entity.
 */
/* @inline */ function removeTraitFromEntity(world: World, entity: Entity, trait: Trait): void {
	const ctx = world[$internal];
	const data = getTraitData(ctx.traitData, trait)!;
	const { generationId, bitflag, queries, trackingQueries } = data;

	// Call remove subscriptions before removing the trait
	for (const sub of data.removeSubscriptions) {
		sub(entity);
	}

	// Remove bitflag from entity bitmask
	const eid = getEntityId(entity);
	ctx.entityMasks[generationId][eid] &= ~bitflag;

	// Set the entity as dirty
	for (const dirtyMask of ctx.dirtyMasks.values()) {
		dirtyMask[generationId][eid] |= bitflag;
	}

	// Update non-tracking queries
	for (const query of queries) {
		// Use checkQueryWithRelations if query has relation filters, otherwise use checkQuery
		const match =
			query.relationFilters && query.relationFilters.length > 0
				? checkQueryWithRelations(world, query, entity)
				: query.check(world, entity);
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Update tracking queries (with event data)
	for (const query of trackingQueries) {
		// Use checkQueryTrackingWithRelations if query has relation filters, otherwise use checkQueryTracking
		const match =
			query.relationFilters && query.relationFilters.length > 0
				? checkQueryTrackingWithRelations(
						world,
						query,
						entity,
						'remove',
						generationId,
						bitflag
				  )
				: query.checkTracking(world, entity, 'remove', generationId, bitflag);
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Remove trait from entity internally
	ctx.entityTraits.get(entity)!.delete(trait);
}
