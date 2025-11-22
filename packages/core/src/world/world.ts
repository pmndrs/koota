import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import type { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { IsExcluded, createQuery } from '../query/query';
import { createEmptyQueryResult } from '../query/query-result';
import type {
	Query,
	QueryHash,
	QueryParameter,
	QueryResult,
	QueryUnsubscriber,
} from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import type { RelationTarget } from '../relation/types';
import {
	addTrait,
	getTrait,
	hasTrait,
	registerTrait,
	removeTrait,
	setTrait,
} from '../trait/trait';
import type {
	ConfigurableTrait,
	ExtractSchema,
	SetTraitCallback,
	Trait,
	TraitData,
	TraitRecord,
	TraitValue,
} from '../trait/types';
import { universe } from '../universe/universe';
import {
	CommandBuffer,
	CommandHandlers,
	createCommandBuffer,
	clearCommandBuffer,
	playbackCommands,
} from './command-buffer';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

type Options = {
	traits?: ConfigurableTrait[];
	lazy?: boolean;
};

export class World {
	#id = allocateWorldId(universe.worldIndex);

	[$internal] = {
		entityIndex: createEntityIndex(this.#id),
		entityMasks: [[]] as number[][],
		entityTraits: new Map<number, Set<Trait>>(),
		bitflag: 1,
		traitData: new Map<Trait, TraitData>(),
		queries: new Set<Query>(),
		queriesHashMap: new Map<string, Query>(),
		notQueries: new Set<Query>(),
		dirtyQueries: new Set<Query>(),
		relationTargetEntities: new Set<RelationTarget>(),
		dirtyMasks: new Map<number, number[][]>(),
		trackingSnapshots: new Map<number, number[][]>(),
		changedMasks: new Map<number, number[][]>(),
		worldEntity: null! as Entity,
		traitById: [] as Trait[],
		trackedTraits: new Set<Trait>(),
		resetSubscriptions: new Set<(world: World) => void>(),
		commandBuffer: null as unknown as CommandBuffer,
		commandHandlers: null as unknown as CommandHandlers,
	};

	get id() {
		return this.#id;
	}

	#isInitialized = false;
	get isInitialized() {
		return this.#isInitialized;
	}

	get entities() {
		return getAliveEntities(this[$internal].entityIndex);
	}

	traits = new Set<Trait>();

	constructor(polyArg?: Options | ConfigurableTrait, ...traits: ConfigurableTrait[]) {
		if (polyArg && typeof polyArg === 'object' && !Array.isArray(polyArg)) {
			const { traits: optionTraits = [], lazy = false } = polyArg as Options;
			if (!lazy) this.init(...optionTraits);
		} else {
			this.init(...(polyArg ? [polyArg, ...traits] : traits));
		}

		// Initialize command buffer and handlers after world is constructed.
		const ctx = this[$internal];
		ctx.commandBuffer = createCommandBuffer();
		ctx.commandHandlers = createWorldCommandHandlers(this);
	}

	init(...traits: ConfigurableTrait[]) {
		const ctx = this[$internal];
		if (this.#isInitialized) return;

		this.#isInitialized = true;
		universe.worlds[this.#id] = this;

		// Create uninitialized added masks.
		const cursor = getTrackingCursor();
		for (let i = 0; i < cursor; i++) {
			setTrackingMasks(this, i);
		}

		// Register system traits.
		if (!ctx.traitData.has(IsExcluded)) registerTrait(this, IsExcluded);

		// Create cached queries.
		for (const [hash, parameters] of universe.cachedQueries) {
			const query = createQuery(this, parameters);
			ctx.queriesHashMap.set(hash, query);
		}

		// Create world entity.
		ctx.worldEntity = createEntity(this, IsExcluded, ...traits);
	}

	spawn(...traits: ConfigurableTrait[]): Entity {
		return createEntity(this, ...traits);
	}

	has(entity: Entity): boolean;
	has(trait: Trait): boolean;
	has(target: Entity | Trait): boolean {
		return typeof target === 'number'
			? isEntityAlive(this[$internal].entityIndex, target)
			: hasTrait(this, this[$internal].worldEntity, target);
	}

	add(...traits: ConfigurableTrait[]) {
		addTrait(this, this[$internal].worldEntity, ...traits);
	}

	remove(...traits: Trait[]) {
		removeTrait(this, this[$internal].worldEntity, ...traits);
	}

	get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
		return getTrait(this, this[$internal].worldEntity, trait);
	}

	set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
		setTrait(this, this[$internal].worldEntity, trait, value);
	}

	destroy() {
		// Destroy world entity.
		destroyEntity(this, this[$internal].worldEntity);
		this[$internal].worldEntity = null!;

		this.reset();
		this.#isInitialized = false;

		// Clean up universe side effects.
		releaseWorldId(universe.worldIndex, this.#id);
		universe.worlds[this.#id] = null;
	}

	reset() {
		const ctx = this[$internal];

		// Destroy all entities so any cleanup is done.
		this.entities.forEach((entity) => {
			// Some relations may have caused the entity to be destroyed before
			// we get to them in the loop.
			if (this.has(entity)) {
				destroyEntity(this, entity);
			}
		});

		ctx.entityIndex = createEntityIndex(this.#id);
		ctx.entityTraits.clear();
		ctx.entityMasks = [[]];
		ctx.bitflag = 1;

		ctx.traitData.clear();
		this.traits.clear();

		ctx.queries.clear();
		ctx.queriesHashMap.clear();
		ctx.dirtyQueries.clear();
		ctx.notQueries.clear();

		ctx.relationTargetEntities.clear();

		ctx.trackingSnapshots.clear();
		ctx.dirtyMasks.clear();
		ctx.changedMasks.clear();
		ctx.trackedTraits.clear();

		// Create new world entity.
		ctx.worldEntity = createEntity(this, IsExcluded);

		for (const sub of ctx.resetSubscriptions) {
			sub(this);
		}
	}

	query<T extends QueryParameter[]>(key: QueryHash<T>): QueryResult<T>;
	query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
	query(...args: [string] | QueryParameter[]) {
		const ctx = this[$internal];

		if (typeof args[0] === 'string') {
			const query = ctx.queriesHashMap.get(args[0]);
			if (!query) return createEmptyQueryResult();
			return query.run(this);
		} else {
			const params = args as QueryParameter[];
			const hash = createQueryHash(params);
			let query = ctx.queriesHashMap.get(hash);

			if (!query) {
				query = createQuery(this, params);
				ctx.queriesHashMap.set(hash, query);
			}

			return query.run(this);
		}
	}

	queryFirst<T extends QueryParameter[]>(key: QueryHash<T>): Entity | undefined;
	queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
	queryFirst(...args: [string] | QueryParameter[]) {
		// @ts-expect-error - Having an issue with the TS overloads.
		return this.query(...args)[0];
	}

	onAdd<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber {
		const ctx = this[$internal];
		let data = ctx.traitData.get(trait)!;

		if (!data) {
			registerTrait(this, trait);
			data = ctx.traitData.get(trait)!;
		}

		data.addSubscriptions.add(callback);

		return () => data.addSubscriptions.delete(callback);
	}

	onQueryAdd<T extends QueryParameter[]>(
		key: QueryHash<T>,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryAdd<T extends QueryParameter[]>(
		parameters: T,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryAdd(
		args: QueryHash<QueryParameter[]> | QueryParameter[],
		callback: (entity: Entity) => void
	): QueryUnsubscriber {
		const ctx = this[$internal];
		let query: Query;

		if (typeof args === 'string') {
			query = ctx.queriesHashMap.get(args)!;
		} else {
			const hash = createQueryHash(args);
			query = ctx.queriesHashMap.get(hash)!;

			if (!query) {
				query = createQuery(this, args);
				ctx.queriesHashMap.set(hash, query);
			}
		}

		query.addSubscriptions.add(callback);

		return () => query.addSubscriptions.delete(callback);
	}

	onQueryRemove<T extends QueryParameter[]>(
		key: QueryHash<T>,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryRemove<T extends QueryParameter[]>(
		parameters: T,
		callback: (entity: Entity) => void
	): QueryUnsubscriber;
	onQueryRemove(
		args: QueryHash<QueryParameter[]> | QueryParameter[],
		callback: (entity: Entity) => void
	): QueryUnsubscriber {
		const ctx = this[$internal];
		let query: Query;

		if (typeof args === 'string') {
			query = ctx.queriesHashMap.get(args)!;
		} else {
			const hash = createQueryHash(args);
			query = ctx.queriesHashMap.get(hash)!;

			if (!query) {
				query = createQuery(this, args);
				ctx.queriesHashMap.set(hash, query);
			}
		}

		query.removeSubscriptions.add(callback);

		return () => query.removeSubscriptions.delete(callback);
	}

	onRemove<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber {
		const ctx = this[$internal];
		let data = ctx.traitData.get(trait)!;

		if (!data) {
			registerTrait(this, trait);
			data = ctx.traitData.get(trait)!;
		}

		data.removeSubscriptions.add(callback);

		return () => data.removeSubscriptions.delete(callback);
	}

	onChange(trait: Trait, callback: (entity: Entity) => void) {
		const ctx = this[$internal];

		// Register the trait if it's not already registered.
		if (!ctx.traitData.has(trait)) registerTrait(this, trait);

		const data = ctx.traitData.get(trait)!;
		data.changeSubscriptions.add(callback);

		// Used by auto change detection to know which traits to track.
		ctx.trackedTraits.add(trait);

		return () => {
			data.changeSubscriptions.delete(callback);
			if (data.changeSubscriptions.size === 0) ctx.trackedTraits.delete(trait);
		};
	}
}

function createWorldCommandHandlers(world: World): CommandHandlers {
	const ctx = world[$internal];

	return {
		spawnEntity(e) {
			// Entity allocation is currently handled eagerly in createEntity.
			// This handler is a placeholder for future deferred entity creation.
			void e;
		},
		destroyEntity(e) {
			// Destruction is currently performed directly via destroyEntity(world, e).
			// This handler is a placeholder and intentionally left empty for now.
			void e;
		},
		addTrait(entity, traitId) {
			const trait = ctx.traitById[traitId];
			if (!trait) return;
			// Use existing addTrait with a single trait; params (defaults/overrides)
			// are handled at command recording time via separate set commands.
			addTrait(world, entity, trait);
		},
		setTrait(entity, traitId, value) {
			const trait = ctx.traitById[traitId];
			if (!trait) return;
			setTrait(world, entity, trait, value, false);
		},
		removeTrait(entity, traitId) {
			const trait = ctx.traitById[traitId];
			if (!trait) return;
			removeTrait(world, entity, trait);
		},
		markTraitChanged(entity, traitId) {
			const trait = ctx.traitById[traitId];
			if (!trait) return;
			const data = ctx.traitData.get(trait);
			if (!data) return;

			// Reuse existing change detection by marking the entity as changed.
			for (const sub of data.changeSubscriptions) {
				sub(entity);
			}
		},
	};
}

export function flushCommands(world: World): void {
	const ctx = world[$internal];
	if (!ctx.commandBuffer) return;
	if (ctx.commandBuffer.write === 0) return;
	playbackCommands(ctx.commandBuffer, ctx.commandHandlers);
	clearCommandBuffer(ctx.commandBuffer);
}

export function createWorld(options: Options): World;
export function createWorld(...traits: ConfigurableTrait[]): World;
export function createWorld(
	optionsOrFirstTrait?: Options | ConfigurableTrait,
	...traits: ConfigurableTrait[]
) {
	return new World(optionsOrFirstTrait, ...traits);
}
