import { getStore } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import {
	Component,
	ComponentOrWithParams,
	PropsFromSchema,
	SchemaFromComponent,
	StoreFromComponents,
} from '../component/types';
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
import { $internal } from './symbols';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

export class World {
	#id = allocateWorldId(universe.worldIndex);

	[$internal] = {
		entityIndex: createEntityIndex(this.#id),
		entityMasks: [[]] as number[][],
		entityComponents: new Map<number, Set<Component>>(),
		bitflag: 1,
		componentRecords: new Map<Component, ComponentRecord>(),
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

	components = new Set<Component>();

	constructor(components?: ComponentOrWithParams | ComponentOrWithParams[]) {
		this.init(components);
	}

	init(components: ComponentOrWithParams | ComponentOrWithParams[] = []) {
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
		const componentsArray = Array.isArray(components)
			? (components as ComponentOrWithParams[])
			: [components];
		ctx.worldEntity = createEntity(this, IsExcluded, ...componentsArray);
	}

	spawn(...components: ComponentOrWithParams[]): Entity {
		return createEntity(this, ...components);
	}

	has(entity: Entity): boolean;
	has(component: Component): boolean;
	has(target: Entity | Component): boolean {
		return typeof target === 'number'
			? isEntityAlive(this[$internal].entityIndex, target)
			: this[$internal].worldEntity.has(target);
	}

	add(...components: ComponentOrWithParams[]) {
		this[$internal].worldEntity.add(...components);
	}

	remove(...components: Component[]) {
		this[$internal].worldEntity.remove(...components);
	}

	get<T extends Component>(component: T): PropsFromSchema<SchemaFromComponent<T>> {
		return this[$internal].worldEntity.get(component);
	}

	set<T extends Component>(component: T, value: Partial<PropsFromSchema<SchemaFromComponent<T>>>) {
		this[$internal].worldEntity.set(component, value);
	}

	getStore<T extends [Component, ...Component[]]>(...components: T): StoreFromComponents<T> {
		const stores = components.map((component) => getStore(this, component));
		return (components.length === 1 ? stores[0] : stores) as StoreFromComponents<T>;
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
		ctx.entityComponents.clear();
		ctx.notQueries.clear();
		ctx.entityMasks = [[]];
		ctx.bitflag = 1;

		if (this.entities) this.entities.forEach((entity) => entity.destroy());

		ctx.componentRecords.clear();
		this.components.clear();

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

	query(key: string): QueryResult;
	query(...parameters: QueryParameter[]): QueryResult;
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

			return createQueryResult(query.run(this), this, params);
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

	onChange(component: Component, callback: (entity: Entity) => void) {
		const ctx = this[$internal];
		let record = ctx.componentRecords.get(component)!;

		if (!record) {
			record = new ComponentRecord(this, component);
			ctx.componentRecords.set(component, record);
		}

		record.changedSubscriptions.add(callback);

		return () => record.changedSubscriptions.delete(callback);
	}
}

export function createWorld(components?: ComponentOrWithParams | ComponentOrWithParams[]) {
	return new World(components);
}
