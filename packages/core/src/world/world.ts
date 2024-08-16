import { addComponent, getStore, hasComponent, removeComponent } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import { Component, ComponentOrWithParams, StoreFromComponents } from '../component/types';
import { createEntity, destroyEntity } from '../entity/entity';
import { setChanged } from '../query/modifiers/changed';
import { Query } from '../query/query';
import { QueryParameter, QuerySubscriber } from '../query/types';
import { archetypeHash } from '../query/utils/archetypes-hash';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { getRelationTargets } from '../relation/relation';
import { Relation, RelationTarget } from '../relation/types';
import { universe } from '../universe/universe';
import { Deque } from '../utils/deque';
import { SparseSet } from '../utils/sparse-set';
import {
	$bitflag,
	$changedMasks,
	$componentRecords,
	$dirtyMasks,
	$dirtyQueries,
	$entityComponents,
	$entityCursor,
	$entityMasks,
	$entitySparseSet,
	$notQueries,
	$onInit,
	$queries,
	$queriesHashMap,
	$recyclingBin,
	$relationTargetEntities,
	$removed,
	$trackingSnapshots,
} from './symbols';
import { Resources } from './utils/resource';

type Options = {
	resources?: Component | Component[];
	init?: boolean;
};

export class World {
	[$entityMasks]: number[][] = [new Array()];
	[$entityComponents] = new Map();
	[$bitflag] = 1;
	[$componentRecords] = new Map<Component, ComponentRecord>();
	[$queries] = new Set<Query>();
	[$queriesHashMap] = new Map<string, Query>();
	[$notQueries] = new Set<Query>();
	[$dirtyQueries] = new Set<Query>();
	[$entityCursor] = 0;
	[$removed] = new Deque<number>();
	[$recyclingBin]: number[] = [];
	[$relationTargetEntities] = new Set<RelationTarget>();
	[$trackingSnapshots] = new Map<number, number[][]>();
	[$dirtyMasks] = new Map<number, number[][]>();
	[$changedMasks] = new Map<number, number[][]>();
	[$onInit]: (() => void)[] = [];

	#isInitialized = false;
	get isInitialized() {
		return this.#isInitialized;
	}

	[$entitySparseSet] = new SparseSet();
	get entities() {
		return this[$entitySparseSet].dense;
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
		universe.worlds.push(this);

		// Create uninitialized added masks.
		const cursor = getTrackingCursor();
		for (let i = 0; i < cursor; i++) {
			setTrackingMasks(this, i);
		}

		// Call onInit callbacks.
		this[$onInit].forEach((callback) => callback());
	}

	create(...components: ComponentOrWithParams[]): number {
		return createEntity(this, ...components);
	}

	add(entity: number, ...components: ComponentOrWithParams[]) {
		addComponent(this, entity, ...components);
	}

	remove(entity: number, ...components: Component[]) {
		removeComponent(this, entity, ...components);
	}

	has(entity: number): boolean;
	has(entity: number, component: Component): boolean;
	has(entity: number, component?: Component) {
		return component ? hasComponent(this, entity, component) : this[$entitySparseSet].has(entity);
	}

	get<T extends [Component, ...Component[]]>(...components: T): StoreFromComponents<T> {
		const stores = components.map((component) => getStore(this, component));
		return (components.length === 1 ? stores[0] : stores) as StoreFromComponents<T>;
	}

	destroy(target?: number) {
		if (target === undefined) {
			// Destroy itself and all entities.
			this.entities.forEach((entity) => destroyEntity(this, entity));
			this.reset();
			this.#isInitialized = false;
			universe.worlds.splice(universe.worlds.indexOf(this), 1);
		} else if (typeof target === 'number') {
			// Destroy target entity.
			destroyEntity(this, target);
		}
	}

	reset() {
		if (this.entities) this.entities.forEach((entity) => this.destroy(entity));

		this[$entityMasks].forEach((mask) => (mask.length = 0));
		this[$entityComponents].clear();
		this[$entitySparseSet].clear();

		this[$bitflag] = 1;
		this[$entityCursor] = 0;
		this[$removed].clear();
		this[$recyclingBin].length = 0;

		this[$componentRecords].clear();

		this[$queries].clear();
		this[$queriesHashMap].clear();
		this[$notQueries].clear();
		this[$dirtyQueries].clear();
		this[$relationTargetEntities].clear();

		this[$trackingSnapshots].clear();
		this[$dirtyMasks].clear();
		this[$changedMasks].clear();
		this.resources.clear();

		this[$onInit].length = 0;
	}

	recycle() {
		this[$removed].enqueue(...this[$recyclingBin]);
		this[$recyclingBin].length = 0;
	}

	getTargets<T>(relation: Relation<T>, entity: number) {
		return getRelationTargets(this, relation, entity);
	}

	query = Object.assign(
		function (this: World, ...parameters: QueryParameter[]) {
			const hash = archetypeHash(parameters);
			let query = this[$queriesHashMap].get(hash);

			if (!query) {
				query = new Query(this, parameters);
				this[$queriesHashMap].set(hash, query);
			}

			return query.run(this);
		},
		{
			subscribe: function (
				this: World,
				parameters: QueryParameter[],
				callback: QuerySubscriber
			) {
				const hash = archetypeHash(parameters);
				let query = this[$queriesHashMap].get(hash);

				if (!query) {
					query = new Query(this, parameters);
					this[$queriesHashMap].set(hash, query);
				}

				query.subscriptions.add(callback);

				return () => query.subscriptions.delete(callback);
			}.bind(this),
		}
	);

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
