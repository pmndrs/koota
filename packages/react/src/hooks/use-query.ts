import { $internal, cacheQuery, type QueryParameter, type QueryResult } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const initialQueryVersionRef = useRef(0);
	// Used to track if we need to rerun effects internally.
	const [version, setVersion] = useState(0);

	// This will rerun every render since parameters will always be a fresh
	// array, but the return value will be stable.
	const hash = useMemo(() => cacheQuery(...parameters), [parameters]);

	useMemo(() => {
		// Using internals to get the query data.
		const query = world[$internal].queriesHashMap.get(hash)!;
		initialQueryVersionRef.current = query.version;
	}, [world, hash]);

	const [entities, setEntities] = useState<QueryResult<T>>(() => world.query(hash).sort());

	// Subscribe to changes.
	useEffect(() => {
		const unsubAdd = world.onQueryAdd(hash, () => {
			setEntities(world.query(hash).sort());
		});

		const unsubRemove = world.onQueryRemove(hash, () => {
			setEntities(world.query(hash).sort());
		});

		// Compare the initial version to the current version to
		// see it the query has changed.
		const query = world[$internal].queriesHashMap.get(hash)!;
		if (query.version !== initialQueryVersionRef.current) {
			setEntities(world.query(hash).sort());
		}

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, hash, version]);

	// Force reattaching event listeners when the world is reset.
	useEffect(() => {
		const handler = () => setVersion((v) => v + 1);
		world[$internal].resetSubscriptions.add(handler);

		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return entities;
}
