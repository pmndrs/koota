import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import type { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { IsExcluded, createQueryInstance } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { isQuery } from '../query/utils/is-query';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { getEntitiesWithRelationTo } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { clearTraitData, getTraitData, hasTraitData } from '../trait/trait-data';
import type {
	ConfigurableTrait,
	ExtractSchema,
	SetTraitCallback,
	Trait,
	TraitInstance,
	TraitRecord,
	TraitValue,
} from '../trait/types';
import { universe } from '../universe/universe';
import type { World, WorldOptions } from './types';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

export function createWorld(options: WorldOptions): World;
export function createWorld(...traits: ConfigurableTrait[]): World;
export function createWorld(
	optionsOrFirstTrait?: WorldOptions | ConfigurableTrait,
	...traits: ConfigurableTrait[]
): World {
	const id = allocateWorldId(universe.worldIndex);
	let isInitialized = false;

	const world = {
		[$internal]: {
			entityIndex: createEntityIndex(id),
			entityMasks: [[]] as number[][],
			entityTraits: new Map<number, Set<Trait>>(),
			bitflag: 1,
			traitInstances: [] as (TraitInstance | undefined)[],
			relations: new Set<Relation<Trait>>(),
			queriesHashMap: new Map<string, QueryInstance>(),
			queryInstances: [] as (QueryInstance | undefined)[],
			actionInstances: [] as (any | undefined)[],
			notQueries: new Set<QueryInstance>(),
			dirtyQueries: new Set<QueryInstance>(),
			dirtyMasks: new Map<number, number[][]>(),
			trackingSnapshots: new Map<number, number[][]>(),
			changedMasks: new Map<number, number[][]>(),
			worldEntity: null! as Entity,
			trackedTraits: new Set<Trait>(),
			resetSubscriptions: new Set<(world: World) => void>(),
		},

		traits: new Set<Trait>(),

		init(...initTraits: ConfigurableTrait[]) {
			const ctx = world[$internal];
			if (isInitialized) return;

			isInitialized = true;
			universe.worlds[id] = world;

			// Create uninitialized added masks.
			const cursor = getTrackingCursor();
			for (let i = 0; i < cursor; i++) {
				setTrackingMasks(world, i);
			}

			// Register system traits.
			if (!hasTraitData(ctx.traitInstances, IsExcluded)) registerTrait(world, IsExcluded);

			// Create cached queries.
			for (const [hash, queryRef] of universe.cachedQueries) {
				const query = createQueryInstance(world, queryRef.parameters);
				ctx.queriesHashMap.set(hash, query);
			}

			// Create world entity.
			ctx.worldEntity = createEntity(world, IsExcluded, ...initTraits);
		},

		spawn(...spawnTraits: ConfigurableTrait[]): Entity {
			return createEntity(world, ...spawnTraits);
		},

		has(target: Entity | Trait): boolean {
			return typeof target === 'number'
				? isEntityAlive(world[$internal].entityIndex, target)
				: hasTrait(world, world[$internal].worldEntity, target);
		},

		add(...addTraits: ConfigurableTrait[]) {
			addTrait(world, world[$internal].worldEntity, ...addTraits);
		},

		remove(...removeTraits: Trait[]) {
			removeTrait(world, world[$internal].worldEntity, ...removeTraits);
		},

		get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
			return getTrait(world, world[$internal].worldEntity, trait);
		},

		set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
			setTrait(world, world[$internal].worldEntity, trait, value, true);
		},

		destroy() {
			// Destroy world entity.
			destroyEntity(world, world[$internal].worldEntity);
			world[$internal].worldEntity = null!;

			world.reset();
			isInitialized = false;

			// Clean up universe side effects.
			releaseWorldId(universe.worldIndex, id);
			universe.worlds[id] = null;
		},

		reset() {
			const ctx = world[$internal];

			// Destroy all entities so any cleanup is done.
			world.entities.forEach((entity) => {
				// Some relations may have caused the entity to be destroyed before
				// we get to them in the loop.
				if (world.has(entity)) {
					destroyEntity(world, entity);
				}
			});

			ctx.entityIndex = createEntityIndex(id);
			ctx.entityTraits.clear();
			ctx.entityMasks = [[]];
			ctx.bitflag = 1;

			clearTraitData(ctx.traitInstances);
			world.traits.clear();
			ctx.relations.clear();

			ctx.queriesHashMap.clear();
			ctx.queryInstances.length = 0;
			ctx.actionInstances.length = 0;
			ctx.dirtyQueries.clear();
			ctx.notQueries.clear();

			ctx.trackingSnapshots.clear();
			ctx.dirtyMasks.clear();
			ctx.changedMasks.clear();
			ctx.trackedTraits.clear();

			// Create new world entity.
			ctx.worldEntity = createEntity(world, IsExcluded);

			// Restore cached queries.
			for (const [hash, queryRef] of universe.cachedQueries) {
				const query = createQueryInstance(world, queryRef.parameters);
				ctx.queriesHashMap.set(hash, query);
			}

			for (const sub of ctx.resetSubscriptions) {
				sub(world);
			}
		},

		query(...args: any[]) {
			const ctx = world[$internal];

			// Check if first arg is a QueryRef (has symbol brand)
			if (args.length === 1 && isQuery(args[0])) {
				const queryRef = args[0];
				// Try array lookup first (faster)
				let query = ctx.queryInstances[queryRef.id];
				if (query) return query.run(world);

				// Fallback to hash map
				query = ctx.queriesHashMap.get(queryRef.hash);
				if (!query) {
					query = createQueryInstance(world, queryRef.parameters);
					ctx.queriesHashMap.set(queryRef.hash, query);
					// Store in array for fast future lookups
					if (queryRef.id >= ctx.queryInstances.length) {
						ctx.queryInstances.length = queryRef.id + 1;
					}
					ctx.queryInstances[queryRef.id] = query;
				}
				return query.run(world);
			} else {
				const params = args as QueryParameter[];

				// Fast path: single relation pair with specific target
				if (params.length === 1 && isRelationPair(params[0])) {
					const pairCtx = params[0][$internal];
					const relation = pairCtx.relation;
					const target = pairCtx.target;

					// Only use fast path for specific targets
					if (typeof target === 'number') {
						const entities = getEntitiesWithRelationTo(
							world,
							relation as Relation<Trait>,
							target as Entity
						);
						return createRelationOnlyQueryResult(entities.slice() as Entity[]);
					}
				}

				const hash = createQueryHash(params);
				let query = ctx.queriesHashMap.get(hash);

				if (!query) {
					query = createQueryInstance(world, params);
					ctx.queriesHashMap.set(hash, query);
				}

				return query.run(world);
			}
		},

		queryFirst(...args: [string] | QueryParameter[]) {
			// @ts-expect-error - Having an issue with the TS overloads.
			return world.query(...args)[0];
		},

		onAdd<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber {
			const ctx = world[$internal];
			let data = getTraitData(ctx.traitInstances, trait);

			if (!data) {
				registerTrait(world, trait);
				data = getTraitData(ctx.traitInstances, trait)!;
			}

			data.addSubscriptions.add(callback);

			return () => data.addSubscriptions.delete(callback);
		},

		onQueryAdd(
			args: Query<QueryParameter[]> | QueryParameter[],
			callback: (entity: Entity) => void
		): QueryUnsubscriber {
			const ctx = world[$internal];
			let query: QueryInstance;

			// Check if args is a QueryRef object
			if (isQuery(args)) {
				const queryRef = args;
				query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

				if (!query) {
					query = createQueryInstance(world, queryRef.parameters);
					ctx.queriesHashMap.set(queryRef.hash, query);
					if (queryRef.id >= ctx.queryInstances.length) {
						ctx.queryInstances.length = queryRef.id + 1;
					}
					ctx.queryInstances[queryRef.id] = query;
				}
			} else {
				const hash = createQueryHash(args as QueryParameter[]);
				query = ctx.queriesHashMap.get(hash)!;

				if (!query) {
					query = createQueryInstance(world, args as QueryParameter[]);
					ctx.queriesHashMap.set(hash, query);
				}
			}

			query.addSubscriptions.add(callback);

			return () => query.addSubscriptions.delete(callback);
		},

		onQueryRemove(
			args: Query<QueryParameter[]> | QueryParameter[],
			callback: (entity: Entity) => void
		): QueryUnsubscriber {
			const ctx = world[$internal];
			let query: QueryInstance;

			// Check if args is a QueryRef object
			if (isQuery(args)) {
				const queryRef = args;
				query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

				if (!query) {
					query = createQueryInstance(world, queryRef.parameters);
					ctx.queriesHashMap.set(queryRef.hash, query);
					if (queryRef.id >= ctx.queryInstances.length) {
						ctx.queryInstances.length = queryRef.id + 1;
					}
					ctx.queryInstances[queryRef.id] = query;
				}
			} else {
				const hash = createQueryHash(args as QueryParameter[]);
				query = ctx.queriesHashMap.get(hash)!;

				if (!query) {
					query = createQueryInstance(world, args as QueryParameter[]);
					ctx.queriesHashMap.set(hash, query);
				}
			}

			query.removeSubscriptions.add(callback);

			return () => query.removeSubscriptions.delete(callback);
		},

		onRemove<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber {
			const ctx = world[$internal];
			let data = getTraitData(ctx.traitInstances, trait);

			if (!data) {
				registerTrait(world, trait);
				data = getTraitData(ctx.traitInstances, trait)!;
			}

			data.removeSubscriptions.add(callback);

			return () => data.removeSubscriptions.delete(callback);
		},

		onChange(trait: Trait, callback: (entity: Entity) => void) {
			const ctx = world[$internal];

			// Register the trait if it's not already registered.
			if (!hasTraitData(ctx.traitInstances, trait)) registerTrait(world, trait);

			const data = getTraitData(ctx.traitInstances, trait)!;
			data.changeSubscriptions.add(callback);

			// Used by auto change detection to know which traits to track.
			ctx.trackedTraits.add(trait);

			return () => {
				data.changeSubscriptions.delete(callback);
				if (data.changeSubscriptions.size === 0) ctx.trackedTraits.delete(trait);
			};
		},
	} as World;

	// Read-only properties via getters
	Object.defineProperty(world, 'id', {
		get: () => id,
		enumerable: true,
	});
	Object.defineProperty(world, 'isInitialized', {
		get: () => isInitialized,
		enumerable: true,
	});
	Object.defineProperty(world, 'entities', {
		get: () => getAliveEntities(world[$internal].entityIndex),
		enumerable: true,
	});

	// Handle initialization based on arguments
	if (
		optionsOrFirstTrait &&
		typeof optionsOrFirstTrait === 'object' &&
		!Array.isArray(optionsOrFirstTrait)
	) {
		const { traits: optionTraits = [], lazy = false } = optionsOrFirstTrait as WorldOptions;
		if (!lazy) world.init(...optionTraits);
	} else {
		world.init(...(optionsOrFirstTrait ? [optionsOrFirstTrait, ...traits] : traits));
	}

	return world;
}
