import { $internal } from '../../common';
import type { Relation, RelationPair } from '../types';

/**
 * Check if a value is a Relation (binary-mode trait).
 */
export /* @inline @pure */ function isRelation(value: unknown): value is Relation {
    return (value as any)?.[$internal]?.mode === 'binary';
}

/**
 * Check if a value is a RelationPair.
 */
export /* @inline @pure */ function isPair(value: unknown): value is RelationPair {
    return Array.isArray(value) && value.length === 3;
}
