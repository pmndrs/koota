import { $internal, cacheQuery, QueryParameter, QueryResult } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const [version, setVersion] = useState(0);

	const [hash, initialQueryVersion] = useMemo(() => {
		const hash = cacheQuery(...parameters);
		// Using internals to get the query data
		const query = world[$internal].queriesHashMap.get(hash)!;
		return [hash, query.version];
	}, [parameters, world]);

	const [entities, setEntities] = useState<QueryResult<T>>(() => world.query(hash).sort());

	// Subscribe to changes
	useEffect(() => {
		const unsubAdd = world.onAdd(parameters, () => {
			setEntities(world.query(hash).sort());
		});

		const unsubRemove = world.onRemove(parameters, () => {
			setEntities(world.query(hash).sort());
		});

		// Compare the initial version to the current version to
		// see it the query has changed
		const query = world[$internal].queriesHashMap.get(hash)!;
		if (query.version !== initialQueryVersion) {
			setEntities(world.query(hash).sort());
		}

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, hash, version]);

	// Force reattaching event listeners when the world is reset
	useEffect(() => {
		const handler = () => setVersion((v) => v + 1);
		world[$internal].resetSubscriptions.add(handler);

		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return entities;
}
