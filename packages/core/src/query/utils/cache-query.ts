import { universe } from '../../universe/universe';
import { $internal } from '../../world/symbols';
import { Query } from '../query';
import { QueryParameter } from '../types';
import { createQueryHash } from './create-query-hash';

export function cacheQuery(...parameters: QueryParameter[]): string {
	const hash = createQueryHash(parameters);

	for (const world of universe.worlds) {
		if (!world) continue;
		const ctx = world[$internal];
		if (!ctx.queriesHashMap.has(hash)) {
			const query = new Query(world, parameters);
			ctx.queriesHashMap.set(hash, query);
		}
	}

	universe.cachedQueries.set(hash, parameters);

	return hash;
}
