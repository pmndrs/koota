import { Entity } from '../entity/types';
import { getRelationTargets, Pair, Wildcard } from '../relation/relation';
import { $exclusiveRelation } from '../relation/symbols';
import {
	$componentRecords,
	$dirtyMasks,
	$internal,
	$queries,
	$relationTargetEntities,
} from '../world/symbols';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { World } from '../world/world';
import { ComponentRecord } from './component-record';
import {
	$componentId,
	$createInstance,
	$createStore,
	$isPairComponent,
	$pairTarget,
	$relation,
} from './symbols';
import { Component, ComponentOrWithParams, Normalized, Schema, StoreFromComponent } from './types';
import { createInstance } from './utils/create-instance';
import { createStore } from './utils/create-store';

let componentId = 0;

function defineComponent<S extends Schema = {}>(schema: S = {} as S): Component<Normalized<S>> {
	const Component = Object.assign(
		function (params: Partial<Normalized<S>>) {
			return [Component, params];
		},
		{
			schema: schema as Normalized<S>,
			[$createStore]: () => createStore(schema as Normalized<S>),
			[$createInstance]: () => createInstance(schema as Normalized<S>, Component),
			[$isPairComponent]: false,
			[$relation]: null,
			[$pairTarget]: null,
			[$componentId]: componentId++,
		}
	) as Component<Normalized<S>>;

	return Component;
}

export const define = defineComponent;

export function registerComponent(world: World, component: Component) {
	const record = new ComponentRecord(world, component);

	// Collect all queries that match this component.
	world[$queries].forEach((query) => {
		if (query.components.all.some((instance) => instance.component === component)) {
			record.queries.add(query);
		}
	});

	// Add component instance to the world.
	world[$componentRecords].set(component, record);
	world.components.add(component);

	// Increment the world bitflag.
	incrementWorldBitflag(world);
}

export function addComponent(world: World, entity: Entity, ...components: ComponentOrWithParams[]) {
	const ctx = world[$internal];

	for (let i = 0; i < components.length; i++) {
		// Get component and params.
		let component: Component;
		let params: Record<string, any> | undefined;

		if (Array.isArray(components[i])) {
			[component, params] = components[i] as [Component, Record<string, any>];
		} else {
			component = components[i] as Component;
		}

		// Exit early if the entity already has the component.
		if (entity.has(component)) return;

		// Register the component if it's not already registered.
		if (!world[$componentRecords].has(component)) registerComponent(world, component);

		// Get component instance.
		const instance = world[$componentRecords].get(component)!;
		const { generationId, bitflag, queries } = instance;

		// Add bitflag to entity bitmask.
		ctx.entityMasks[generationId][entity] |= bitflag;

		// Set the entity as dirty.
		for (const dirtyMask of world[$dirtyMasks].values()) {
			if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
			dirtyMask[generationId][entity] |= bitflag;
		}

		// Update queries.
		for (const query of queries) {
			// Remove this entity from toRemove if it exists in this query.
			query.toRemove.remove(entity);

			// Check if the entity matches the query.
			let match = query.check(world, entity, { type: 'add', component: instance });

			if (match) query.add(entity);
			else query.remove(world, entity);
		}

		// Add component to entity internally.
		ctx.entityComponents.get(entity)!.add(component);

		const relation = component[$relation];
		const target = component[$pairTarget];

		// Add relation target entity.
		if (component[$isPairComponent] && relation !== null && target !== null) {
			// Mark entity as a relation target.
			world[$relationTargetEntities].add(target);

			// Add wildcard relation components.
			entity.add(Pair(Wildcard, target));
			entity.add(Pair(relation, Wildcard));

			// If it's an exclusive relation, remove the old target.
			if (relation[$exclusiveRelation] === true && target !== Wildcard) {
				const oldTarget = getRelationTargets(world, relation, entity)[0];

				if (oldTarget !== null && oldTarget !== undefined && oldTarget !== target) {
					removeComponent(world, entity, relation(oldTarget));
				}
			}
		}

		// Set default values or override with provided params.
		const store = world.get(component);
		const defaults = instance.schema;

		for (const key in store) {
			if (typeof defaults[key] === 'function' && !defaults[key].prototype?.constructor) {
				// Run functions and return the result. Ignore constructors.
				store[key][entity] = params?.[key] ?? defaults[key]();
			} else {
				// Or just return the value.
				store[key][entity] = params?.[key] ?? defaults[key];
			}
		}
	}
}

export function removeComponent(world: World, entity: Entity, ...components: Component[]) {
	const ctx = world[$internal];

	for (let i = 0; i < components.length; i++) {
		const component = components[i];

		// Exit early if the entity doesn't have the component.
		if (!entity.has(component)) return;

		// Get component record.
		const record = world[$componentRecords].get(component)!;
		const { generationId, bitflag, queries } = record;

		// Remove bitflag from entity bitmask.
		ctx.entityMasks[generationId][entity] &= ~bitflag;

		// Set the entity as dirty.
		for (const dirtyMask of world[$dirtyMasks].values()) {
			dirtyMask[generationId][entity] |= bitflag;
		}

		// Update queries.
		for (const query of queries) {
			// Check if the entity matches the query.
			let match = query.check(world, entity, { type: 'remove', component: record });

			if (match) query.add(entity);
			else query.remove(world, entity);
		}

		// Remove component from entity internally.
		ctx.entityComponents.get(entity)!.delete(component);

		// Remove wildcard relations if it is a Pair component.
		if (component[$isPairComponent]) {
			// Check if entity is still a subject of any relation or not.
			if (world.query(Wildcard(entity)).length === 0) {
				world[$relationTargetEntities].delete(entity);

				// TODO: cleanup query by hash
				// removeQueryByHash(world, [Wildcard(eid)])
			}

			// Remove wildcard to this target for this entity.
			const target = component[$pairTarget]!;
			removeComponent(world, entity, Pair(Wildcard, target));

			// Remove wildcard relation if the entity has no other relations.
			const relation = component[$relation]!;
			const otherTargets = getRelationTargets(world, relation, entity);

			if (otherTargets.length === 0) {
				removeComponent(world, entity, Pair(relation, Wildcard));
			}
		}
	}
}

export function hasComponent(world: World, entity: Entity, component: Component): boolean {
	const registeredComponent = world[$componentRecords].get(component);
	if (!registeredComponent) return false;

	const ctx = world[$internal];

	const { generationId, bitflag } = registeredComponent;
	const mask = ctx.entityMasks[generationId][entity];

	return (mask & bitflag) === bitflag;
}

export function getStore<C extends Component = Component>(
	world: World,
	component: C
): StoreFromComponent<C> {
	// Need this for relation components. There might be a better way to handle this.
	if (!world[$componentRecords].has(component)) registerComponent(world, component);

	const record = world[$componentRecords].get(component)!;
	return record.store as StoreFromComponent<C>;
}
