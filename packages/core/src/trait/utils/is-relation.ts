import { $internal } from '../../common';
import type { Pair, PairPattern, Relation } from '../types';

/**
 * Check if a value is a Relation (binary-mode trait).
 */
export /* @inline @pure */ function isRelation(value: unknown): value is Relation {
    return (value as any)?.[$internal]?.mode === 'binary';
}

/**
 * Check if a value is a concrete pair tuple (entity target).
 */
export /* @inline @pure */ function isPair(value: unknown): value is Pair {
    return Array.isArray(value) && value.length === 3 && typeof value[1] === 'number';
}

/**
 * Check if a value is a pair tuple (concrete or wildcard).
 */
export /* @inline @pure */ function isPairPattern(value: unknown): value is PairPattern {
    return Array.isArray(value) && value.length === 3;
}
