import { Entity, QueryParameter, QueryResult } from '@koota/core';
import { useEffect, useMemo, useReducer } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const entities = useMemo(() => world.query(...parameters), [world, ...parameters]);
	const [, forceUpdate] = useReducer((v) => v + 1, 0);

	// Immediately subscribe to changes.
	const unsubAdd = useMemo(
		() =>
			world.onAdd(parameters, (entity) => {
				const mutableEntities = entities as unknown as Entity[];
				mutableEntities.push(entity);
				forceUpdate();
			}),
		[world],
	);

	const unsubRemove = useMemo(
		() =>
			world.onRemove(parameters, (entity) => {
				const mutableEntities = entities as unknown as Entity[];
				const index = mutableEntities.indexOf(entity);
				mutableEntities[index] =
					mutableEntities[mutableEntities.length - 1];
				mutableEntities.pop();
				forceUpdate();
			}),
		[world],
	);

	useEffect(() => {
		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world]);

	return entities;
}
