import { TraitData } from '../trait/trait-data';
import { ConfigurableTrait, ExtractSchema, TraitInstanceFromSchema, Trait } from '../trait/types';
import { createEntity, destroyEntity } from '../entity/entity';
import { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { IsExcluded, Query } from '../query/query';
import { createQueryResult } from '../query/query-result';
import { QueryParameter, QueryResult } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { RelationTarget } from '../relation/types';
import { universe } from '../universe/universe';
import { $internal } from '../common';
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
			: this[$internal].worldEntity.has(target);
	}

	add(...traits: ConfigurableTrait[]) {
		this[$internal].worldEntity.add(...traits);
	}

	remove(...traits: Trait[]) {
		this[$internal].worldEntity.remove(...traits);
	}

	get<T extends Trait>(trait: T): TraitInstanceFromSchema<ExtractSchema<T>> {
		return this[$internal].worldEntity.get(trait);
	}

	set<T extends Trait>(trait: T, value: Partial<TraitInstanceFromSchema<ExtractSchema<T>>>) {
		this[$internal].worldEntity.set(trait, value);
	}

	destroy() {
		// Destroy itself and all entities.
		this.entities.forEach((entity) => destroyEntity(this, entity));
		this.reset();
		this.#isInitialized = false;
		releaseWorldId(universe.worldIndex, this.#id);
		universe.worlds.splice(universe.worlds.indexOf(this), 1);

		// Destroy world entity.
		destroyEntity(this, this[$internal].worldEntity);
		this[$internal].worldEntity = null!;
	}

	reset() {
		const ctx = this[$internal];

		ctx.entityIndex = createEntityIndex(this.#id);
		ctx.entityTraits.clear();
		ctx.notQueries.clear();
		ctx.entityMasks = [[]];
		ctx.bitflag = 1;

		if (this.entities) this.entities.forEach((entity) => entity.destroy());

		ctx.traitData.clear();
		this.traits.clear();

		ctx.queries.clear();
		ctx.queriesHashMap.clear();
		ctx.dirtyQueries.clear();
		ctx.relationTargetEntities.clear();

		ctx.trackingSnapshots.clear();
		ctx.dirtyMasks.clear();
		ctx.changedMasks.clear();

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
		let data = ctx.traitData.get(trait)!;

		if (!data) {
			data = new TraitData(this, trait);
			ctx.traitData.set(trait, data);
		}

		data.changedSubscriptions.add(callback);

		return () => data.changedSubscriptions.delete(callback);
	}
}

export function createWorld(...traits: ConfigurableTrait[]) {
	return new World(...traits);
}
