import { $internal } from '../../';
import { universe } from '../../universe/universe';
import { createQuery } from '../query';
import type { QueryRef, QueryParameter } from '../types';
import { $queryRef } from '../types';
import { createQueryHash } from './create-query-hash';

let queryId = 0;

export function defineQuery<T extends QueryParameter[]>(...parameters: T): QueryRef<T> {
	const hash = createQueryHash(parameters);

	// Check if this query was already cached
	const existing = universe.cachedQueries.get(hash);
	if (existing) {
		return existing as QueryRef<T>;
	}

	// Create new query ref with ID
	const id = queryId++;
	const queryRef = Object.freeze({
		[$queryRef]: true,
		id,
		hash,
		parameters,
	}) as QueryRef<T>;

	for (const world of universe.worlds) {
		if (!world) continue;

		const ctx = world[$internal];

		if (!ctx.queriesHashMap.has(hash)) {
			const query = createQuery(world, parameters);
			ctx.queriesHashMap.set(hash, query);
		}
	}

	universe.cachedQueries.set(hash, queryRef);

	return queryRef;
}

/** @deprecated Use defineQuery instead */
export const cacheQuery = defineQuery;
