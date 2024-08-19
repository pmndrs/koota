import { universe } from '../../universe/universe';
import { $queriesHashMap } from '../../world/symbols';
import { Query } from '../query';
import { QueryParameter } from '../types';
import { createQueryHash } from './create-query-hash';

export function cacheQuery(...parameters: QueryParameter[]): string {
	const hash = createQueryHash(parameters);

	for (const world of universe.worlds) {
		if (!world[$queriesHashMap].has(hash)) {
			const query = new Query(world, parameters);
			world[$queriesHashMap].set(hash, query);
		}
	}

	universe.cachedQueries.set(hash, parameters);

	return hash;
}
