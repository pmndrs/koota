import { useEffect, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery(...parameters: Sweet.QueryParameter[]) {
	const world = useWorld();
	const [entities, setEntities] = useState<number[]>([]);

	useEffect(() => {
		const unsub = world.query.subscribe(parameters, (type, entity) => {
			if (type === 'add') {
				setEntities((v) => [...v, entity]);
			} else {
				setEntities((v) => v.filter((e) => e !== entity));
			}
		});

		return () => {
			unsub();
		};
	}, [world, parameters]);

	return entities;
}
