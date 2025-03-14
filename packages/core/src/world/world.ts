import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { IsExcluded, Query } from '../query/query';
import { createQueryResult } from '../query/query-result';
import { QueryHash, QueryParameter, QueryResult } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { RelationTarget } from '../relation/types';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { TraitData } from '../trait/trait-data';
import { ConfigurableTrait, ExtractSchema, Trait, TraitInstance, TraitValue } from '../trait/types';
import { universe } from '../universe/universe';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

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
		trackedTraits: new Set<Trait>(),
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

	constructor(...traits: ConfigurableTrait[]) {
		this.init(...traits);
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

		// Create cached queries.
		for (const [hash, parameters] of universe.cachedQueries) {
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
		this.#isInitialized = false;
		releaseWorldId(universe.worldIndex, this.#id);
		universe.worlds.splice(universe.worlds.indexOf(this), 1);
	}

	reset() {
		const ctx = this[$internal];

		ctx.entityIndex = createEntityIndex(this.#id);
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

	query<T extends QueryParameter[]>(key: QueryHash<T>): QueryResult<T>;
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
