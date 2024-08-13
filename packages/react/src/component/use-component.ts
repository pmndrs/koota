import { Component, ComponentInstance, Schema, SchemaFromComponent, SYMBOLS } from '@sweet-ecs/core';
import { useCallback, useRef, useState } from 'react';

export function useComponent<T extends Component, TSchema extends Schema = SchemaFromComponent<T>>(
	component: T,
	initialValue:
		| Partial<ComponentInstance<TSchema>>
		| (() => Partial<ComponentInstance<TSchema>>) = {}
) {
	const [, rerender] = useState(0);

	const ref = useRef(
		(() => {
			const instance = component[SYMBOLS.$createInstance]() as ComponentInstance<TSchema>;

			// Initialize the component with the initial state.
			if (typeof initialValue === 'function') {
				Object.assign(instance, initialValue());
			} else {
				Object.assign(instance, initialValue);
			}

			return instance;
		})()
	);

	const set = useCallback((value: Partial<ComponentInstance<TSchema>>) => {
		// Merge values.
		Object.assign(ref.current, value);

		// Notify changed.
		const c = ref.current;
		if (c[SYMBOLS.$world] !== null && c[SYMBOLS.$entity] !== null) {
			c[SYMBOLS.$world]!.changed(c[SYMBOLS.$entity]!, c[SYMBOLS.$component]);
		}

		// Force React to rerender.
		rerender((v) => v + 1);
	}, []);

	return [ref.current, set] as const;
}
