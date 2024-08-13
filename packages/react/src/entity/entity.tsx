import { Component, World, SYMBOLS, ComponentInstance, ComponentOrWithParams } from '@sweet-ecs/core';
import React, { forwardRef, useImperativeHandle, useInsertionEffect, useRef } from 'react';
import { useWorld } from '../world/use-world';
import { EntityContext } from './entity-context';

type ComponentProp = Component | ComponentInstance | null | undefined;

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

function createEntity(world: World, ...components: ComponentProp[]) {
	const instances: ComponentInstance[] = [];

	const filteredComponents = components.filter((c) => c !== null && c !== undefined) as Component[];
	const allThoseCompies = filteredComponents.map((c) => {
		if (isComponentInstance(c)) {
			instances.push(c);
			return c[SYMBOLS.$component].with(c);
		} else {
			return c;
		}
	}) as ComponentOrWithParams[];

	const entity = world.create(...allThoseCompies);

	// Add metadata to the instances.
	instances.forEach((instance) => {
		instance[SYMBOLS.$world] = world;
		instance[SYMBOLS.$entity] = entity;
	});

	return entity;
}

function isComponentInstance(c: Component | ComponentInstance): c is ComponentInstance {
	return (c as any)[SYMBOLS.$component] !== undefined;
}
