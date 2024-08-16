import { SYMBOLS } from '@koota/core';
import React, { forwardRef, useImperativeHandle, useInsertionEffect, useRef } from 'react';
import { useWorld } from '../world/use-world';
import { EntityContext } from './entity-context';
import { ComponentProp } from '../component/types';

type Props = {
	children?: React.ReactNode;
	components?: ComponentProp[];
};

export const Entity = forwardRef<number, Props>(function Entity({ children, components = [] }, ref) {
	const world = useWorld();
	const entityRef = useRef(-1);

	// Inits the entity at ref time if we are attached to the tree.
	useImperativeHandle(
		(node) => {
			if (node === null) return;

			if (entityRef.current === -1 && world.isInitialized) {
				entityRef.current = createEntity(world, ...components);
			}

			if (ref !== null) consumeRef(ref, entityRef.current);
		},
		() => entityRef.current
	);

	// Initial cleanup runs before ref. Final cleanup will run after on unmount.
	useInsertionEffect(() => {
		if (entityRef.current === -1 && !world.isInitialized) {
			world[SYMBOLS.$onInit].push(() => {
				entityRef.current = createEntity(world, ...components);
			});
		} else if (entityRef.current === -1 && world.isInitialized) {
			entityRef.current = createEntity(world, ...components);
		}

		return () => {
			if (entityRef.current !== -1 && world.isInitialized) {
				world.destroy(entityRef.current);
			}
		};
	}, []);

	return <EntityContext.Provider value={entityRef}>{children}</EntityContext.Provider>;
});

function consumeRef<T>(ref: React.Ref<T>, node: T | null) {
	if (typeof ref === 'function') {
		return ref(node);
	}
	// @ts-expect-error - I don't know the proper way to type this.
	return (ref.current = node);
}

function createEntity(world: Koota.World, ...components: ComponentProp[]) {
	const instances: Koota.ComponentInstance[] = [];

	// Use a Map to track components, allowing to overwrite them if necessary.
	const componentMap = new Map<Koota.Component, Koota.ComponentOrWithParams>();

	components.forEach((c) => {
		if (c === null || c === undefined) {
			// Skip null or undefined components
			return;
		}

		if (isComponentInstance(c)) {
			instances.push(c);
			// If it's an instance, store the "with" version in the map, overwriting if necessary
			componentMap.set(c[SYMBOLS.$component], c[SYMBOLS.$component].with(c));
		} else if (isComponentWithParams(c)) {
			// If it is a component with params stor it, overwriting if necessary
			componentMap.set(c[0], c);
		} else {
			// Store the component directly, overwriting if necessary
			componentMap.set(c, c);
		}
	});

	// Create the entity with the components from the map
	const entity = world.create(...Array.from(componentMap.values()));

	// Add metadata to the instances.
	instances.forEach((instance) => {
		instance[SYMBOLS.$world] = world;
		instance[SYMBOLS.$entity] = entity;
	});

	return entity;
}

function isComponentInstance(
	c: Koota.ComponentOrWithParams | Koota.ComponentInstance
): c is Koota.ComponentInstance {
	return (c as any)[SYMBOLS.$component] !== undefined;
}

function isComponentWithParams(
	c: Koota.ComponentOrWithParams
): c is [Koota.Component, Record<string, any>] {
	return Array.isArray(c);
}
