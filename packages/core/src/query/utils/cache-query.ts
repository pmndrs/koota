import { $internal } from '../../';
import { universe } from '../../universe/universe';
import { createQuery } from '../query';
import type { QueryHash, QueryParameter } from '../types';
import { createQueryHash } from './create-query-hash';

export function cacheQuery<T extends QueryParameter[]>(...parameters: T): QueryHash<T> {
	const hash = createQueryHash(parameters);

	for (const worldRef of universe.worlds) {
		if (!worldRef) continue;

		const world = worldRef.deref()!;
		const ctx = world[$internal];

		if (!ctx.queriesHashMap.has(hash)) {
			const query = createQuery(world, parameters);
			ctx.queriesHashMap.set(hash, query);
		}
	}

	universe.cachedQueries.set(hash, parameters);

	return hash as QueryHash<T>;
}
