import { addComponent, getStore, hasComponent, removeComponent } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import {
	Component,
	ComponentOrWithParams,
	ComponentWithParams,
	StoreFromComponents,
} from '../component/types';
import { createEntity, destroyEntity } from '../entity/entity';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { setChanged } from '../query/modifiers/changed';
import { Query } from '../query/query';
import { QueryParameter, QuerySubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { getRelationTargets } from '../relation/relation';
import { Relation, RelationTarget } from '../relation/types';
import { universe } from '../universe/universe';
import {
	$changedMasks,
	$componentRecords,
	$dirtyMasks,
	$dirtyQueries,
	$internal,
	$onInit,
	$queries,
	$queriesHashMap,
	$relationTargetEntities,
	$trackingSnapshots,
} from './symbols';
import { allocateWorldId, releaseWorldId } from './utils/world-index';
import { Resources } from './utils/resource';
import { Entity } from '../entity/types';

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
	};

	[$componentRecords] = new Map<Component, ComponentRecord>();
	[$queries] = new Set<Query>();
	[$queriesHashMap] = new Map<string, Query>();
	[$dirtyQueries] = new Set<Query>();
	[$relationTargetEntities] = new Set<RelationTarget>();
	[$trackingSnapshots] = new Map<number, number[][]>();
	[$dirtyMasks] = new Map<number, number[][]>();
	[$changedMasks] = new Map<number, number[][]>();
	[$onInit]: (() => void)[] = [];

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
			this[$queriesHashMap].set(hash, query);
		}

		// Call onInit callbacks.
		this[$onInit].forEach((callback) => callback());
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

	set<T extends ComponentWithParams[]>(entity: number, ...components: T) {
		for (const [component, params] of components) {
			const store = this.get(component);

			for (const key in params) {
				(store as any)[key][entity] = params[key];
			}
		}
	}

	destroy(target?: Entity) {
		if (target === undefined) {
			// Destroy itself and all entities.
			this.entities.forEach((entity) => destroyEntity(this, entity));
			this.reset();
			this.#isInitialized = false;
			releaseWorldId(universe.worldIndex, this.#id);
			universe.worlds.splice(universe.worlds.indexOf(this), 1);
		} else if (typeof target === 'number') {
			// Destroy target entity.
			destroyEntity(this, target);
		}
	}

	reset() {
		const ctx = this[$internal];

		ctx.entityIndex = createEntityIndex(this.#id);
		ctx.entityComponents.clear();
		ctx.notQueries.clear();
		ctx.entityMasks = [[]];
		ctx.bitflag = 1;

		if (this.entities) this.entities.forEach((entity) => this.destroy(entity));

		this[$componentRecords].clear();

		this[$queries].clear();
		this[$queriesHashMap].clear();
		this[$dirtyQueries].clear();
		this[$relationTargetEntities].clear();

		this[$trackingSnapshots].clear();
		this[$dirtyMasks].clear();
		this[$changedMasks].clear();
		this.resources.clear();

		this[$onInit].length = 0;
	}

	getTargets<T>(relation: Relation<T>, entity: number) {
		return getRelationTargets(this, relation, entity);
	}

	query = Object.assign(query, {
		subscribe: function (this: World, parameters: QueryParameter[], callback: QuerySubscriber) {
			const hash = createQueryHash(parameters);
			let query = this[$queriesHashMap].get(hash);

			if (!query) {
				query = new Query(this, parameters);
				this[$queriesHashMap].set(hash, query);
			}

			query.subscriptions.add(callback);

			return () => query.subscriptions.delete(callback);
		}.bind(this),
	});

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
				let record = this[$componentRecords].get(component)!;

				if (!record) {
					record = new ComponentRecord(this, component);
					this[$componentRecords].set(component, record);
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
	if (typeof args[0] === 'string') {
		const query = this[$queriesHashMap].get(args[0]);
		if (!query) return [];
		return query.run(this);
	} else {
		const hash = createQueryHash(args as QueryParameter[]);
		let query = this[$queriesHashMap].get(hash);

		if (!query) {
			query = new Query(this, args as QueryParameter[]);
			this[$queriesHashMap].set(hash, query);
		}

		return query.run(this);
	}
}
