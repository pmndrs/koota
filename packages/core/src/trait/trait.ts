import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import {
	addRelationTarget,
	clearRelationData,
	getRelationData,
	getRelationTargets,
	getSchemaDefaults,
	hasRelationPair as hasRelationPairInternal,
	hasRelationToTarget,
	isPairConfig,
	isPairTupleConfig,
	isRelationPair,
	isWildcard,
	removeAllRelationTargets,
	removeRelationTarget,
	setRelationData,
	setRelationDataAtIndex,
	Wildcard,
} from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
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
} from './types';
import {
	createFastSetChangeFunction,
	createFastSetFunction,
	createGetFunction,
	createSetFunction,
} from './utils/create-accessors';
import { createStore } from './utils/create-store';
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

	const Trait = Object.assign((params: Partial<Norm<S>>) => [Trait, params], {
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
	}) as any;

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
		notQueries: new Set(),
		schema: trait.schema,
		changeSubscriptions: new Set(),
		addSubscriptions: new Set(),
		removeSubscriptions: new Set(),
	};

	// Bind a reference to the store on the trait for direct access in queries.
	traitCtx.stores[world.id] = data.store;

	// Add trait to the world.
	ctx.traitData.set(trait, data);
	world.traits.add(trait);

	// Increment the bitflag used for the trait.
	incrementWorldBitflag(world);
}

export function addTrait(world: World, entity: Entity, ...traits: ConfigurableTrait[]) {
	for (let i = 0; i < traits.length; i++) {
		const config = traits[i];

		// Handle relation pairs
		if (isPairConfig(config)) {
			addRelationPair(world, entity, config, undefined);
			continue;
		}

		// Handle relation pair tuples with data
		if (isPairTupleConfig(config)) {
			addRelationPair(world, entity, config[0], config[1]);
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
		if (traitCtx.type === 'soa') {
			const defaults: Record<string, any> = {};
			for (const key in data.schema) {
				if (typeof data.schema[key] === 'function') {
					defaults[key] = data.schema[key]();
				} else {
					defaults[key] = data.schema[key];
				}
			}
			setTrait(world, entity, trait, { ...defaults, ...params }, false);
		} else {
			const state = params ?? data.schema();
			setTrait(world, entity, trait, state, false);
		}

		// Call add subscriptions after values are set
		for (const sub of data.addSubscriptions) {
			sub(entity);
		}
	}
}

/**
 * Add a relation pair to an entity.
 */
/* @inline */ function addRelationPair(
	world: World,
	entity: Entity,
	pair: RelationPair,
	params?: Record<string, unknown>
) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;
	// Use params from pair if not provided as argument
	const resolvedParams = params ?? pairCtx.params;

	// Wildcard pairs are not added as actual traits
	if (isWildcard(relation)) return;

	const relationTrait = relation[$internal].trait;
	const relationCtx = relation[$internal];

	// Ignore if entity already relates to this target
	if (typeof target === 'number' && hasRelationToTarget(world, relation, entity, target)) {
		return;
	}

	// For exclusive relations, remove the old target first
	if (relationCtx.exclusive && typeof target === 'number') {
		const oldTargets = getRelationTargets(world, relation, entity);
		if (oldTargets.length > 0 && oldTargets[0] !== target) {
			removeRelationTarget(world, relation, entity, oldTargets[0]);
			clearRelationData(world, entity, relation, 0);
		}
	}

	// Add the base trait (handles registration, bitmask, queries)
	const data = addTraitToEntity(world, entity, relationTrait);

	// Add the target to the relation store
	if (typeof target === 'number') {
		const targetIndex = addRelationTarget(world, relation, entity, target);

		// Initialize default values for this target
		const traitCtx = relationTrait[$internal];
		const schema = data?.schema ?? world[$internal].traitData.get(relationTrait)!.schema;
		const defaults = getSchemaDefaults(schema, traitCtx.type);
		if (defaults) {
			setRelationDataAtIndex(world, entity, relation, targetIndex, {
				...defaults,
				...resolvedParams,
			});
		} else if (resolvedParams) {
			setRelationDataAtIndex(world, entity, relation, targetIndex, resolvedParams);
		}
	}

	// Call add subscriptions after values are set (only if trait was newly added)
	if (data) {
		for (const sub of data.addSubscriptions) {
			sub(entity);
		}
	}
}

export function removeTrait(world: World, entity: Entity, ...traits: (Trait | RelationPair)[]) {
	for (let i = 0; i < traits.length; i++) {
		const traitOrPair = traits[i];

		// Handle relation pairs
		if (isRelationPair(traitOrPair)) {
			removeRelationPair(world, entity, traitOrPair);
			continue;
		}

		const trait = traitOrPair;

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
/* @inline */ function removeRelationPair(world: World, entity: Entity, pair: RelationPair) {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;

	// Handle Wildcard relation removal
	if (isWildcard(relation)) {
		return;
	}

	const baseTrait = relation[$internal].trait;

	// Check if entity has this relation
	if (!hasTrait(world, entity, baseTrait)) return;

	// Handle wildcard target - remove all targets
	if (target === Wildcard || target === '*') {
		// Clear all data first
		const targets = getRelationTargets(world, relation, entity);
		for (let i = targets.length - 1; i >= 0; i--) {
			clearRelationData(world, entity, relation, i);
		}

		removeAllRelationTargets(world, relation, entity);
		removeTraitFromEntity(world, entity, baseTrait);
		return;
	}

	// Remove specific target
	if (typeof target === 'number') {
		const removedIndex = removeRelationTarget(world, relation, entity, target);
		if (removedIndex === -1) return;

		// Clear the data at that index
		clearRelationData(world, entity, relation, removedIndex);

		// If no targets remain, remove the base trait
		const remainingTargets = getRelationTargets(world, relation, entity);
		if (remainingTargets.length === 0) {
			removeTraitFromEntity(world, entity, baseTrait);
		}
	}
}

export /* @inline @pure */ function hasTrait(world: World, entity: Entity, trait: Trait): boolean {
	const ctx = world[$internal];
	const data = ctx.traitData.get(trait);
	if (!data) return false;

	const { generationId, bitflag } = data;
	const eid = getEntityId(entity);
	const mask = ctx.entityMasks[generationId][eid];

	return (mask & bitflag) === bitflag;
}

/**
 * Check if entity has a relation pair.
 */
export function hasRelationPair(world: World, entity: Entity, pair: RelationPair): boolean {
	return hasRelationPairInternal(world, entity, pair, hasTrait);
}

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
	world: World,
	trait: C
): ExtractStore<C> {
	const ctx = world[$internal];
	const data = ctx.traitData.get(trait)!;
	return data.store as ExtractStore<C>;
}

export function setTrait(
	world: World,
	entity: Entity,
	trait: Trait | RelationPair,
	value: any,
	triggerChanged = true
) {
	// Handle relation pairs
	if (isRelationPair(trait)) {
		const pairCtx = trait[$internal];
		const relation = pairCtx.relation as Relation<Trait>;
		const target = pairCtx.target;

		if (typeof target === 'number') {
			setRelationData(world, entity, relation, target, value);
			if (triggerChanged) {
				setChanged(world, entity, relation[$internal].trait);
			}
		}
		return;
	}

	const ctx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(ctx.get(index, store)));

	ctx.set(index, store, value);
	triggerChanged && setChanged(world, entity, trait);
}

export function getTrait(world: World, entity: Entity, trait: Trait | RelationPair) {
	// Handle relation pairs
	if (isRelationPair(trait)) {
		const pairCtx = trait[$internal];
		const relation = pairCtx.relation as Relation<Trait>;
		const target = pairCtx.target;

		if (!hasRelationPair(world, entity, trait)) return undefined;

		if (typeof target === 'number') {
			return getRelationData(world, entity, relation, target);
		}
		return undefined;
	}

	const result = hasTrait(world, entity, trait);
	if (!result) return undefined;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	return traitCtx.get(getEntityId(entity), store);
}

/**
 * Core logic for adding a trait to an entity.
 * Handles: registration, bitmask, dirty flags, queries, entityTraits.
 * Does NOT handle: value initialization or subscriptions (caller's responsibility).
 * Returns the TraitData if trait was added, undefined if already existed.
 */
/* @inline */ function addTraitToEntity(
	world: World,
	entity: Entity,
	trait: Trait
): TraitData | undefined {
	// Exit early if the entity already has the trait.
	if (hasTrait(world, entity, trait)) return undefined;

	const ctx = world[$internal];

	// Register the trait if it's not already registered.
	if (!ctx.traitData.has(trait)) registerTrait(world, trait);

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
		query.toRemove.remove(entity);
		const match = query.check(world, entity, { type: 'add', traitData: data });
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Add trait to entity internally.
	ctx.entityTraits.get(entity)!.add(trait);

	return data;
}

/**
 * Core logic for removing a trait from an entity.
 * Handles: subscriptions, bitmask, dirty flags, queries, entityTraits.
 * Does NOT handle: relation target cleanup (caller's responsibility).
 */
/* @inline */ function removeTraitFromEntity(world: World, entity: Entity, trait: Trait): void {
	const ctx = world[$internal];
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
		const match = query.check(world, entity, { type: 'remove', traitData: data });
		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	// Remove trait from entity internally.
	ctx.entityTraits.get(entity)!.delete(trait);
}
