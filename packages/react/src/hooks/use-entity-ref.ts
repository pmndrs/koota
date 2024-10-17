import { Entity } from '@koota/core';
import { useCallback, useRef } from 'react';
import { useWorld } from '../world/use-world';

export function useEntityRef<T = any>(callback: (node: T, entity: Entity) => void) {
	const world = useWorld();
	const entityRef = useRef<Entity>(null!);

	return useCallback(
		(node: T) => {
			if (node) {
				if (entityRef.current) entityRef.current.destroy();
				entityRef.current = world.spawn();
				callback(node, entityRef.current);
			} else if (entityRef.current) {
				entityRef.current.destroy();
			}
		},
		[world]
	);
}
