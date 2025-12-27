import { $internal, createQuery, type QueryParameter, type QueryResult } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const initialQueryVersionRef = useRef(0);
	// Used to track if we need to rerun effects internally.
	const [version, setVersion] = useState(0);

	// This will rerun every render since parameters will always be a fresh
	// array, but the return value will be stable.
	const queryRef = useMemo(() => createQuery(...parameters), [parameters]);
	// Registers the query with the world.
	const [entities, setEntities] = useState<QueryResult<T>>(() => world.query(queryRef).sort());

	initialQueryVersionRef.current = useMemo(() => {
		// Using internals to get the query data.
		const query = world[$internal].queriesHashMap.get(queryRef.hash)!;
		return query.version;
	}, [world, queryRef]);

	// Subscribe to changes.
	useEffect(() => {
		const unsubAdd = world.onQueryAdd(queryRef, () => {
			setEntities(world.query(queryRef).sort());
		});

		const unsubRemove = world.onQueryRemove(queryRef, () => {
			setEntities(world.query(queryRef).sort());
		});

		// Compare the initial version to the current version to
		// see it the query has changed.
		const query = world[$internal].queriesHashMap.get(queryRef.hash)!;
		if (query.version !== initialQueryVersionRef.current) {
			setEntities(world.query(queryRef).sort());
		}

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, queryRef, version]);

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
