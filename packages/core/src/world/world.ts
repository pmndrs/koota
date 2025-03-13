import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import { Entity } from '../entity/types';
import {
	createEntityIndex,
	EntityIndex,
	getAliveEntities,
	isEntityAlive,
} from '../entity/utils/entity-index';
import { IsExcluded, Query } from '../query/query';
import { createQueryResult } from '../query/query-result';
import { QueryParameter, QueryResult } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { RelationTarget } from '../relation/types';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { TraitData } from '../trait/trait-data';
import { ConfigurableTrait, ExtractSchema, Trait, TraitInstance, TraitValue } from '../trait/types';
import { Universe, universe as universe_Singleton } from '../universe/universe';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

const $protected = Symbol('protected');
const $protected_factories = Symbol('protected_factories');

export class World {
	static [$protected_factories]: {
		withCustomUniverse(universe: Universe, ...traits: ConfigurableTrait[]): World;
	};

	[$protected]: {
		isInitialized: boolean;
		universe: Universe;
		id: number;
		traits: Set<Trait>;
	};

	[$internal]: {
		entityIndex: EntityIndex;
		entityMasks: number[][];
		entityTraits: Map<number, Set<Trait>>;
		bitflag: number;
		traitData: Map<Trait, TraitData>;
		queries: Set<Query>;
		queriesHashMap: Map<string, Query>;
		notQueries: Set<Query>;
		dirtyQueries: Set<Query>;
		relationTargetEntities: Set<RelationTarget>;
		dirtyMasks: Map<number, number[][]>;
		trackingSnapshots: Map<number, number[][]>;
		changedMasks: Map<number, number[][]>;
		worldEntity: Entity;
		trackedTraits: Set<Trait>;
	};

	get id() {
		return this[$protected].id;
	}

	get isInitialized() {
		return this[$protected].isInitialized;
	}

	get entities() {
		return getAliveEntities(this[$internal].entityIndex);
	}

	get traits() {
		return this[$protected].traits;
	}

	constructor(...traits: ConfigurableTrait[]) {
		this[$protected] = {
			isInitialized: false,
			universe: universe_Singleton,
			id: allocateWorldId(universe_Singleton.worldIndex),
			traits: new Set(),
		};

		this[$internal] = {
			entityIndex: createEntityIndex(this[$protected].id),
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
			trackedTraits: new Set<Trait>(),
		};

		this.init(...traits);
	}

	init(...traits: ConfigurableTrait[]) {
		const ctx = this[$internal];
		if (this[$protected].isInitialized) return;

		this[$protected].isInitialized = true;
		this[$protected].universe.worlds[this[$protected].id] = this;

		// Create uninitialized added masks.
		const cursor = getTrackingCursor();
		for (let i = 0; i < cursor; i++) {
			setTrackingMasks(this, i);
		}

		// Create cached queries.
		for (const [hash, parameters] of this[$protected].universe.cachedQueries) {
			const query = new Query(this, parameters);
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

	get<T extends Trait>(trait: T): TraitInstance<ExtractSchema<T>> | undefined {
		return getTrait(this, this[$internal].worldEntity, trait);
	}

	set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>>) {
		setTrait(this, this[$internal].worldEntity, trait, value);
	}

	destroy() {
		// Destroy world entity.
		destroyEntity(this, this[$internal].worldEntity);
		this[$internal].worldEntity = null!;

		// Destroy itself and all entities.
		this.entities.forEach((entity) => destroyEntity(this, entity));
		this.reset();
		this[$protected].isInitialized = false;
		releaseWorldId(this[$protected].universe.worldIndex, this[$protected].id);
		this[$protected].universe.worlds.splice(this[$protected].universe.worlds.indexOf(this), 1);
	}

	reset() {
		const ctx = this[$internal];

		ctx.entityIndex = createEntityIndex(this[$protected].id);
		ctx.entityTraits.clear();
		ctx.notQueries.clear();
		ctx.entityMasks = [[]];
		ctx.bitflag = 1;

		ctx.traitData.clear();
		this.traits.clear();

		ctx.queries.clear();
		ctx.queriesHashMap.clear();
		ctx.dirtyQueries.clear();
		ctx.relationTargetEntities.clear();

		ctx.trackingSnapshots.clear();
		ctx.dirtyMasks.clear();
		ctx.changedMasks.clear();
		ctx.trackedTraits.clear();

		// Create new world entity.
		ctx.worldEntity = createEntity(this, IsExcluded);
	}

	query<T extends QueryParameter[]>(key: string): QueryResult<T>;
	query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
	query(...args: [string] | QueryParameter[]) {
		const ctx = this[$internal];

		if (typeof args[0] === 'string') {
			const query = ctx.queriesHashMap.get(args[0]);
			if (!query) return [];
			return query.run(this);
		} else {
			const params = args as QueryParameter[];
			const hash = createQueryHash(params);
			let query = ctx.queriesHashMap.get(hash);

			if (!query) {
				query = new Query(this, params);
				ctx.queriesHashMap.set(hash, query);
			}

			return createQueryResult(query, this, params);
		}
	}

	queryFirst(key: string): Entity | undefined;
	queryFirst(...parameters: QueryParameter[]): Entity | undefined;
	queryFirst(...args: [string] | QueryParameter[]) {
		// @ts-expect-error - Having an issue with the TS overloads.
		return this.query(...args)[0];
	}

	onAdd(parameters: QueryParameter[], callback: (entity: Entity) => void) {
		const ctx = this[$internal];
		const hash = createQueryHash(parameters);
		let query = ctx.queriesHashMap.get(hash);

		if (!query) {
			query = new Query(this, parameters);
			ctx.queriesHashMap.set(hash, query);
		}

		query.addSubscriptions.add(callback);

		return () => query.addSubscriptions.delete(callback);
	}

	onRemove(parameters: QueryParameter[], callback: (entity: Entity) => void) {
		const ctx = this[$internal];
		const hash = createQueryHash(parameters);
		let query = ctx.queriesHashMap.get(hash);

		if (!query) {
			query = new Query(this, parameters);
			ctx.queriesHashMap.set(hash, query);
		}

		query.removeSubscriptions.add(callback);

		return () => query.removeSubscriptions.delete(callback);
	}

	onChange(trait: Trait, callback: (entity: Entity) => void) {
		const ctx = this[$internal];

		// Register the trait if it's not already registered.
		if (!ctx.traitData.has(trait)) registerTrait(this, trait);

		const data = ctx.traitData.get(trait)!;
		data.changedSubscriptions.add(callback);

		// Used by auto change detection to know which traits to track.
		ctx.trackedTraits.add(trait);

		return () => {
			data.changedSubscriptions.delete(callback);
			ctx.trackedTraits.delete(trait);
		};
	}
}

export function createWorld(...traits: ConfigurableTrait[]) {
	return new World(...traits);
}

export function createWorldFromUniverse(universe: Universe, ...traits: ConfigurableTrait[]): World {
	return World[$protected_factories].withCustomUniverse(universe, ...traits);
}

World[$protected_factories] = {
	withCustomUniverse(universe: Universe, ...traits: ConfigurableTrait[]): World {
		const world = Object.create(World.prototype) as World;
		world[$protected] = {
			traits: new Set(),
			isInitialized: false,
			id: allocateWorldId(universe.worldIndex),
			universe: universe,
		};

		world[$internal] = {
			entityIndex: createEntityIndex(world[$protected].id),
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
			trackedTraits: new Set<Trait>(),
		};

		world.init(...traits);
		return world;
	},
};
