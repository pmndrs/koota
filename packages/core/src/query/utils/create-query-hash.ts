import { $internal } from '../../common';
import type { Relation, RelationPair } from '../../relation/types';
import { isIdentifierPair } from '../../identifier/identifier';
import { isRelationPair } from '../../relation/utils/is-relation';
import type { Trait } from '../../trait/types';
import { isQuery } from './is-query';
import type { Modifier, QueryHash, QueryParameter } from '../types';

const MODIFIER_FACTOR = 100000;
const RELATION_FACTOR = 10000000;
const RELATION_OFFSET = 5000000;
// Offset for target-query relation pairs so they don't collide with concrete target encodings.
const RELATION_QUERY_OFFSET = 9000000;

// Reuse the numeric buffer to avoid allocating one per call.
const sortBuf = new Float64Array(1024);

// Maps a sub-query hash string to a stable numeric id for encoding in the Float64Array.
let nextQueryId = 1;
const queryHashToId = new Map<string, number>();

function queryHashNumericId(hash: string): number {
  let id = queryHashToId.get(hash);
  if (id === undefined) {
    id = nextQueryId++;
    queryHashToId.set(hash, id);
  }
  return id;
}

/**
 * Key for a pair inside a modifier, the same key a pair parameter gets. Pair parameters compute
 * theirs in place, since a call there slows every relation query lookup.
 */
function hashModifierPair(pair: RelationPair, cursor: number): number {
  const relationId = (pair.relation as Relation<Trait>)[$internal].trait.id;

  if (pair.targetQuery) {
    const subHash = isQuery(pair.targetQuery)
      ? pair.targetQuery.hash
      : createQueryHash(pair.targetQuery, cursor);
    return relationId * RELATION_FACTOR + queryHashNumericId(subHash) + RELATION_QUERY_OFFSET;
  }

  const target = pair.target;
  const targetId = typeof target === 'number' ? target : -1;
  return relationId * RELATION_FACTOR + targetId + RELATION_OFFSET;
}

/**
 * Hashes what a modifier holds beyond its own traits. Pairs become keys under the modifier id. A
 * tracking modifier nested in Or is set apart from the same modifier outside it.
 */
function hashModifierExtras(param: Modifier, cursor: number, pairKeys: string[]): number {
  const pairs = param.pairs;
  if (pairs !== null) {
    for (let j = 0; j < pairs.length; j++) {
      pairKeys.push(`${param.id}:${hashModifierPair(pairs[j], cursor)}`);
    }
  }

  const nested = param.modifiers;
  if (nested === null) return cursor;
  for (let n = 0; n < nested.length; n++) {
    const modifier = nested[n];
    for (let j = 0; j < modifier.traitIds.length; j++) {
      sortBuf[cursor++] = modifier.id * MODIFIER_FACTOR + modifier.traitIds[j] + 0.5;
    }
    const nestedPairs = modifier.pairs;
    if (nestedPairs === null) continue;
    for (let j = 0; j < nestedPairs.length; j++) {
      pairKeys.push(`or${modifier.id}:${hashModifierPair(nestedPairs[j], cursor)}`);
    }
  }
  return cursor;
}

export const createQueryHash = (parameters: readonly QueryParameter[], base = 0): QueryHash => {
  let cursor = base;
  let identifier: string | undefined;
  let identifiers: string[] | undefined;
  let pairKeys: string[] | undefined;

  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];

    // Traits are the common case and need no modifier or relation checks.
    if (typeof param === 'function') {
      sortBuf[cursor++] = param.id;
      continue;
    }

    if (isIdentifierPair(param)) {
      const key = param.target;
      const value = `${param.identifier.id}:${typeof key === 'string' ? 's' : 'n'}:${key}`;
      if (identifier === undefined) identifier = value;
      else (identifiers ??= [identifier]).push(value);
      continue;
    }

    if (isRelationPair(param)) {
      const relationId = (param.relation as Relation<Trait>)[$internal].trait.id;

      if (param.targetQuery) {
        // Hash inline filters after the entries already written by this query.
        // The recursive call only reads the filter array.
        const subHash = isQuery(param.targetQuery)
          ? param.targetQuery.hash
          : createQueryHash(param.targetQuery, cursor);
        sortBuf[cursor++] =
          relationId * RELATION_FACTOR + queryHashNumericId(subHash) + RELATION_QUERY_OFFSET;
        continue;
      }

      const target = param.target;
      const targetId = typeof target === 'number' ? target : -1;
      sortBuf[cursor++] = relationId * RELATION_FACTOR + targetId + RELATION_OFFSET;
      continue;
    }

    for (let j = 0; j < param.traitIds.length; j++) {
      sortBuf[cursor++] = param.id * MODIFIER_FACTOR + param.traitIds[j];
    }

    if (param.pairs !== null || param.modifiers !== null) {
      cursor = hashModifierExtras(param, cursor, (pairKeys ??= []));
    }
  }

  let hash = '';
  if (cursor === base + 1) hash = `${sortBuf[base]}`;
  else if (cursor > base + 1) hash = sortBuf.subarray(base, cursor).sort().join(',');

  // Pairs inside modifiers follow the numeric entries, each keyed by its modifier id.
  if (pairKeys !== undefined && pairKeys.length !== 0) hash += `~${pairKeys.sort().join(',')}`;

  // Type, namespace and length keep scalar keys unambiguous.
  if (identifiers) {
    identifiers.sort();
    for (let i = 0; i < identifiers.length; i++)
      hash += `|${identifiers[i].length}:${identifiers[i]}`;
  } else if (identifier !== undefined) {
    hash += `|${identifier.length}:${identifier}`;
  }
  return hash;
};
