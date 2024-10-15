import { useEffect, useState } from 'react';
import { useWorld } from '../world/use-world';
import { QueryParameter } from '@koota/core';

export function useQuery(...parameters: QueryParameter[]) {
	const world = useWorld();
	const [entities, setEntities] = useState<number[]>([]);

	useEffect(() => {
		const unsubAdd = world.onAdd(parameters, (entity) => {
			setEntities((v) => [...v, entity]);
		});

		const unsubRemove = world.onRemove(parameters, (entity) => {
			setEntities((v) => v.filter((e) => e !== entity));
		});

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, parameters]);

	return entities;
}
