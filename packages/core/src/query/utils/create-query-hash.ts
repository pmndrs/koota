import { $internal } from '../../common';
import type { Relation } from '../../relation/types';
import { isNameConfig } from '../../name/name-index';
import { isRelationPair } from '../../relation/utils/is-relation';
import type { Trait } from '../../trait/types';
import { isQuery } from './is-query';
import type { QueryHash, QueryParameter } from '../types';

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

export const createQueryHash = (parameters: readonly QueryParameter[], base = 0): QueryHash => {
  let cursor = base;
  let name: string | undefined;
  let names: string[] | undefined;

  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];

    // Traits are the common case and need no modifier or relation checks.
    if (typeof param === 'function') {
      sortBuf[cursor++] = param.id;
      continue;
    }

    if (isNameConfig(param)) {
      const value = param[1];
      if (name === undefined) name = value;
      else (names ??= [name]).push(value);
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
  }

  let hash = '';
  if (cursor === base + 1) hash = `${sortBuf[base]}`;
  else if (cursor > base + 1) hash = sortBuf.subarray(base, cursor).sort().join(',');

  // Length prefixes keep names unambiguous even when they contain separators.
  if (names) {
    names.sort();
    for (let i = 0; i < names.length; i++) hash += `|${names[i].length}:${names[i]}`;
  } else if (name !== undefined) {
    hash += `|${name.length}:${name}`;
  }
  return hash;
};
