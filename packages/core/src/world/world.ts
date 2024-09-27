import { getStore } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import { Component, ComponentOrWithParams, StoreFromComponents } from '../component/types';
import { createEntity, destroyEntity } from '../entity/entity';
import { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { setChanged } from '../query/modifiers/changed';
import { Query } from '../query/query';
import { QueryParameter, QuerySubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { getRelationTargets } from '../relation/relation';
import { Relation, RelationTarget } from '../relation/types';
import { universe } from '../universe/universe';
import { $internal } from './symbols';
import { Resources } from './utils/resource';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

type Options = {
	resources?: Component | Component[];
	init?: boolean;
};

export class World {
	#id = allocateWorldId(universe.worldIndex);

	[$internal] = {
		entityIndex: createEntityIndex(this.#id),
		entityMasks: [[]] as number[][],
		entityComponents: new Map<number, Set<Component>>(),
		notQueries: new Set<Query>(),
		bitflag: 1,
		componentRecords: new Map<Component, ComponentRecord>(),
		queries: new Set<Query>(),
		queriesHashMap: new Map<string, Query>(),
		dirtyQueries: new Set<Query>(),
		relationTargetEntities: new Set<RelationTarget>(),
		dirtyMasks: new Map<number, number[][]>(),
		trackingSnapshots: new Map<number, number[][]>(),
		changedMasks: new Map<number, number[][]>(),
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
	resources = new Resources();

	constructor(options: Options = {}) {
		if (options.resources) {
			const resources = Array.isArray(options.resources)
				? options.resources
				: [options.resources];
			this.resources.add(...resources);
		}

		if (options.init !== false) this.init();
	}

	init() {
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
	}

	spawn(...components: ComponentOrWithParams[]): Entity {
		return createEntity(this, ...components);
	}

	has(entity: Entity): boolean {
		return isEntityAlive(this[$internal].entityIndex, entity);
	}

	get<T extends [Component, ...Component[]]>(...components: T): StoreFromComponents<T> {
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

		ctx.queries.clear();
		ctx.queriesHashMap.clear();
		ctx.dirtyQueries.clear();
		ctx.relationTargetEntities.clear();

		ctx.trackingSnapshots.clear();
		ctx.dirtyMasks.clear();
		ctx.changedMasks.clear();
		this.resources.clear();
	}

	getTargets<T>(relation: Relation<T>, entity: number) {
		return getRelationTargets(this, relation, entity);
	}

	query = Object.assign(query, {
		subscribe: function (this: World, parameters: QueryParameter[], callback: QuerySubscriber) {
			const ctx = this[$internal];
			const hash = createQueryHash(parameters);
			let query = ctx.queriesHashMap.get(hash);

			if (!query) {
				query = new Query(this, parameters);
				ctx.queriesHashMap.set(hash, query);
			}

			query.subscriptions.add(callback);

			return () => query.subscriptions.delete(callback);
		}.bind(this),
	});

	// To be removed.
	changed = Object.assign(
		function (this: World, entity: number, component: Component) {
			setChanged(this, entity, component);
		},
		{
			subscribe: function (
				this: World,
				component: Component,
				callback: (entity: number) => void
			) {
				const ctx = this[$internal];
				let record = ctx.componentRecords.get(component)!;

				if (!record) {
					record = new ComponentRecord(this, component);
					ctx.componentRecords.set(component, record);
				}

				record.changedSubscriptions.add(callback);

				return () => record.changedSubscriptions.delete(callback);
			}.bind(this),
		}
	);
}

export function createWorld(options?: Options) {
	return new World(options);
}

function query(this: World, key: string): readonly Entity[];
function query(this: World, ...parameters: QueryParameter[]): readonly Entity[];
function query(this: World, ...args: [string] | QueryParameter[]) {
	const ctx = this[$internal];

	if (typeof args[0] === 'string') {
		const query = ctx.queriesHashMap.get(args[0]);
		if (!query) return [];
		return query.run(this);
	} else {
		const hash = createQueryHash(args as QueryParameter[]);
		let query = ctx.queriesHashMap.get(hash);

		if (!query) {
			query = new Query(this, args as QueryParameter[]);
			ctx.queriesHashMap.set(hash, query);
		}

		return query.run(this);
	}
}
