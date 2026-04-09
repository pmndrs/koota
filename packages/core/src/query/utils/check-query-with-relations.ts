import type { Entity } from '../../entity/types';
import { hasRelationPair, hasRelationTargetInSet } from '../../relation/relation';
import type { WorldInternal } from '../../world';
import type { QueryInstance } from '../types';
import { checkQuery } from './check-query';

export function checkQueryWithRelations(
    ctx: WorldInternal,
    query: QueryInstance,
    entity: Entity
): boolean {
    if (!checkQuery(ctx, query, entity)) return false;

    if (query.relationFilters && query.relationFilters.length > 0) {
        for (const pair of query.relationFilters) {
            if (pair.targetQueryMatches) {
                if (!hasRelationTargetInSet(ctx, pair.relation, entity, pair.targetQueryMatches)) {
                    return false;
                }
                continue;
            }

            if (!hasRelationPair(ctx, entity, pair)) {
                return false;
            }
        }
    }

    return true;
}
