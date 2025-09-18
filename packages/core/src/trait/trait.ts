import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import { getRelationTargets, Pair, Wildcard } from '../relation/relation';
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
			isPairTrait: false,
			relation: null,
			pairTarget: null,
			isTag: !isAoS && Object.keys(schema).length === 0,
			type: traitType,
		},
	}) as any;

	// Make name writable for debugging.
	Object.defineProperty(Trait, 'name', { writable: true });

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
	const ctx = world[$internal];

	for (let i = 0; i < traits.length; i++) {
		// Get trait and params.
		let trait: Trait;
		let params: Record<string, any> | undefined;

		if (Array.isArray(traits[i])) {
			[trait, params] = traits[i] as [Trait, Record<string, any>];
		} else {
			trait = traits[i] as Trait;
		}

		// Exit early if the entity already has the trait.
		if (hasTrait(world, entity, trait)) return;

		const traitCtx = trait[$internal];

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
					removeTrait(world, entity, relation(oldTarget));
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

			setTrait(world, entity, trait, { ...defaults, ...params }, false);
		} else {
			const state = params ?? data.schema();
			setTrait(world, entity, trait, state, false);
		}

		// Call add subscriptions.
		for (const sub of data.addSubscriptions) {
			sub(entity);
		}
	}
}

export function removeTrait(world: World, entity: Entity, ...traits: Trait[]) {
	const ctx = world[$internal];

	for (let i = 0; i < traits.length; i++) {
		const trait = traits[i];
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

				// TODO: cleanup query by hash
				// removeQueryByHash(world, [Wildcard(eid)])
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
	trait: Trait,
	value: any,
	triggerChanged = true
) {
	const ctx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(ctx.get(index, store)));

	ctx.set(index, store, value);
	triggerChanged && setChanged(world, entity, trait);
}

export function getTrait(world: World, entity: Entity, trait: Trait) {
	const result = hasTrait(world, entity, trait);
	if (!result) return undefined;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	return traitCtx.get(getEntityId(entity), store);
}
