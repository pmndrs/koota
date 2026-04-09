import type { Entity } from '../../entity/types';
import { hasRelationPair, hasRelationTargetInSet } from '../../relation/relation';
import type { WorldInternal } from '../../world';
import type { EventType, QueryInstance } from '../types';
import { checkQueryTracking } from './check-query-tracking';

export function checkQueryTrackingWithRelations(
    ctx: WorldInternal,
    query: QueryInstance,
    entity: Entity,
    eventType: EventType,
    eventGenerationId: number,
    eventBitflag: number
): boolean {
    if (!checkQueryTracking(ctx, query, entity, eventType, eventGenerationId, eventBitflag)) {
        return false;
    }

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
