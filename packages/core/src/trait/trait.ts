import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import {
	cmdAddTrait,
	cmdMarkTraitChanged,
	cmdRemoveTrait,
	cmdSetTrait,
} from '../world/command-buffer';
import { flushCommands } from '../world/command-runtime';
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

	// Map the trait id to the trait instance for command buffer handlers.
	ctx.traitById[traitCtx.id] = trait;

	// Increment the bitflag used for the trait.
	incrementWorldBitflag(world);
}

export function addTrait(world: World, entity: Entity, ...traits: ConfigurableTrait[]) {
	const ctx = world[$internal];
	const buf = ctx.commandBuffer;
	if (!buf) return;

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
		if (hasTrait(world, entity, trait)) continue;

		const traitCtx = trait[$internal];
		const traitId = traitCtx.id;
		// Ensure the world can resolve this trait ID during command execution.
		ctx.traitById[traitId] = trait;
		const schema = trait.schema;

		let initialValue: any;

		if (traitCtx.type === 'soa') {
			// Set default values or override with provided params.
			const defaults: Record<string, any> = {};
			// Execute any functions in the schema for default values.
			for (const key in schema) {
				if (typeof (schema as any)[key] === 'function') {
					defaults[key] = (schema as any)[key]();
				} else {
					defaults[key] = (schema as any)[key];
				}
			}

			initialValue = { ...defaults, ...params };
		} else {
			// AoS traits use the factory as the schema.
			const factory = schema as () => unknown;
			initialValue = params ?? factory();
		}

		// Decompose into primitive commands: add then set.
		cmdAddTrait(buf, entity, traitId);
		cmdSetTrait(buf, entity, traitId, initialValue);
	}

	flushCommands(world);
}

export function removeTrait(world: World, entity: Entity, ...traits: Trait[]) {
	const ctx = world[$internal];
	const buf = ctx.commandBuffer;
	if (!buf) return;

	for (let i = 0; i < traits.length; i++) {
		const trait = traits[i];
		const traitCtx = trait[$internal];

		// Exit early if the entity doesn't have the trait.
		if (!hasTrait(world, entity, trait)) continue;

		const traitId = traitCtx.id;
		cmdRemoveTrait(buf, entity, traitId);
	}

	flushCommands(world);
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
	const ctx = world[$internal];
	const buf = ctx.commandBuffer;
	if (!buf) return;

	const traitCtx = trait[$internal];
	const traitId = traitCtx.id;
	// Ensure the world can resolve this trait ID during command execution.
	ctx.traitById[traitId] = trait;

	cmdSetTrait(buf, entity, traitId, value);
	if (triggerChanged) {
		cmdMarkTraitChanged(buf, entity, traitId);
	}

	flushCommands(world);
}

export function getTrait(world: World, entity: Entity, trait: Trait) {
	const result = hasTrait(world, entity, trait);
	if (!result) return undefined;

	const traitCtx = trait[$internal];
	const store = getStore(world, trait);
	return traitCtx.get(getEntityId(entity), store);
}
