import { QueryParameter, QueryResult } from '@koota/core';
import { useEffect, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const [entities, setEntities] = useState<QueryResult<T>>(world.query(...parameters));

	useEffect(() => {
		const unsubAdd = world.onAdd(parameters, (entity) => {
			setEntities((v) => {
				// @ts-expect-error - QueryResult is a readonly array, but we need to mutate it
				v.push(entity);
				return v;
			});
		});

		const unsubRemove = world.onRemove(parameters, (entity) => {
			setEntities((v) => {
				// Remove the entity from the array by moving and popping it
				const index = v.indexOf(entity);
				// Move the last element to the index of the removed element
				// @ts-expect-error - QueryResult is a readonly array, but we need to mutate it
				v[index] = v[v.length - 1];
				// Pop the last element
				// @ts-expect-error - QueryResult is a readonly array, but we need to mutate it
				v.pop();

				return v;
			});
		});

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, parameters]);

	return entities;
}
