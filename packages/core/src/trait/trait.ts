import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import type { World } from '../world/world';
import { doAddAndSetTrait, doAddTrait, doRemoveTrait, doSetTrait } from '../ops/trait';
import type {
	ConfigurableTrait,
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
import { getStore } from './utils/get-store';
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
		// Get trait and params.
		let trait: Trait;
		let params: Record<string, any> | undefined;

		if (Array.isArray(traits[i])) {
			[trait, params] = traits[i] as [Trait, Record<string, any>];
		} else {
			trait = traits[i] as Trait;
		}

		const ctx = world[$internal];

		// Register the trait if it's not already registered.
		if (!ctx.traitData.has(trait)) registerTrait(world, trait);

		// Exit early if the entity already has the trait.
		if (hasTrait(world, entity, trait)) continue;

		if (params) {
			/* @inline */ doAddAndSetTrait(world, entity, trait, params);
		} else {
			/* @inline */ doAddTrait(world, entity, trait);
		}
	}
}

export function removeTrait(world: World, entity: Entity, ...traits: Trait[]) {
	for (let i = 0; i < traits.length; i++) {
		const trait = traits[i];

		if (!hasTrait(world, entity, trait)) continue;
		/* @inline */ doRemoveTrait(world, entity, trait);
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

export function setTrait(
	world: World,
	entity: Entity,
	trait: Trait,
	value: any,
	triggerChanged = true
) {
	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	const index = getEntityId(entity);

	// A short circuit is more performance than an if statement which creates a new code statement.
	value instanceof Function && (value = value(traitCtx.get(index, store)));

	/* @inline */ doSetTrait(world, entity, trait, value, triggerChanged);
}

export function getTrait(world: World, entity: Entity, trait: Trait) {
	const result = hasTrait(world, entity, trait);
	if (!result) return undefined;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	return traitCtx.get(getEntityId(entity), store);
}
