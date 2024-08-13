import { $component, $entity, $world } from '../symbols';
import { Component, ComponentInstance, Schema } from '../types';

export function createInstance<T extends Schema>(
	schema: T,
	component: Component
): ComponentInstance<T> {
	const instance = { ...schema } as ComponentInstance<T>;

	Object.defineProperties(instance, {
		[$component]: { value: component, writable: false, enumerable: false },
		[$world]: { value: null, writable: true, enumerable: false },
		[$entity]: { value: null, writable: true, enumerable: false },
	});

	for (const key in schema) {
		const value = schema[key];

		if (typeof value === 'function' && !value.prototype?.constructor) {
			instance[key] = value();
		}
	}

	return instance;
}
