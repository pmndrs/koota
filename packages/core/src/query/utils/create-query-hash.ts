import type { Archetype } from '../../archetype/archetype-graph';
import { $internal } from '../../common';
import type { ConcreteRelationPair } from '../../relation/types';
import { isRelationPair } from '../../relation/utils/is-relation';
import { universe } from '../../universe/universe';
import { isModifier } from '../modifier';
import { isQuery } from './is-query';
import type { OrModifier, QueryHash, QueryParameter } from '../types';

const MODIFIER_FACTOR = 100000;
const RELATION_FACTOR = 10000000;
const RELATION_OFFSET = 5000000;
// Offset for target-query relation pairs so they don't collide with concrete target encodings.
const RELATION_QUERY_OFFSET = 9000000;

// Reusable buffer — avoids allocation per call.
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

type FilterNode = {
  children?: Map<unknown, FilterNode>;
  hash?: QueryHash;
};

let filterRoot: FilterNode = {};
let filterCount = 0;

function filterStep(node: FilterNode, key: unknown): FilterNode {
  const children = (node.children ??= new Map());
  let next = children.get(key);
  if (next === undefined) {
    next = {};
    children.set(key, next);
  }
  return next;
}

function addQueryTrait(archetype: Archetype, parameter: QueryParameter): Archetype {
  let traitId: number;
  if (typeof parameter === 'function') traitId = parameter.id;
  else if (isRelationPair(parameter)) traitId = parameter.relation[$internal].trait.id;
  else return archetype;

  return archetype.add.get(traitId) ?? universe.archetypes.add(archetype, traitId);
}

/** Resolve only the traits an entity must possess, independent of query filters. */
export function getQueryArchetype(parameters: readonly QueryParameter[]): Archetype {
  let archetype = universe.archetypes.root;
  for (const parameter of parameters) {
    archetype = addQueryTrait(archetype, parameter);
  }
  return archetype;
}

export function resetQueryFilters(): void {
  filterRoot = {};
  filterCount = 0;
}

// `base` is the first free slot in the shared sort buffer so nested hashes do not
// clobber the entries their parent has already written.
function computeQueryHash(
  archetype: Archetype,
  parameters: readonly QueryParameter[],
  base: number
): QueryHash {
  let cursor = base;
  for (const traitId of archetype.traitIds) sortBuf[cursor++] = traitId;

  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];

    if (isRelationPair(param)) {
      const relationId = param.relation[$internal].trait.id;

      if (param.targetQuery) {
        // Hash inline filters after the entries already written by this query.
        const subHash = isQuery(param.targetQuery)
          ? param.targetQuery.hash
          : hashShape(param.targetQuery, cursor);
        sortBuf[cursor++] =
          relationId * RELATION_FACTOR + queryHashNumericId(subHash) + RELATION_QUERY_OFFSET;
        continue;
      }

      const target = param.target;
      const targetId = typeof target === 'number' ? target : -1;
      sortBuf[cursor++] = relationId * RELATION_FACTOR + targetId + RELATION_OFFSET;
      continue;
    }

    if (isModifier(param)) {
      for (let j = 0; j < param.traitIds.length; j++) {
        sortBuf[cursor++] = param.id * MODIFIER_FACTOR + param.traitIds[j];
      }

      // Or keeps its nested modifiers apart from its own traits, so they need their own
      // entries or an Or built only from modifiers would hash as if it were empty. Negating
      // them keeps them clear of every other encoding, which is entirely positive.
      const nested = (param as OrModifier).modifiers;
      if (nested !== undefined) {
        for (let k = 0; k < nested.length; k++) {
          const traitIds = nested[k].traitIds;
          for (let j = 0; j < traitIds.length; j++) {
            sortBuf[cursor++] = -(nested[k].id * MODIFIER_FACTOR + traitIds[j]);
          }
        }
      }

      continue;
    }
  }

  const filled = sortBuf.subarray(base, cursor);
  filled.sort();
  return filled.join(',');
}

function hashShape(parameters: readonly QueryParameter[], base: number): QueryHash {
  let archetype = universe.archetypes.root;
  let shape: FilterNode | undefined;
  for (const parameter of parameters) {
    archetype = addQueryTrait(archetype, parameter);
    if (typeof parameter === 'function') continue;

    // Entity targets and modifiers stay outside the trait-set graph.
    if (shape === undefined) {
      if (filterCount >= 1024) resetQueryFilters();
      shape = filterRoot;
    }
    if (parameter.queryToken === 0) {
      const pair = parameter as ConcreteRelationPair;
      shape = filterStep(shape, pair.relation);
      shape = filterStep(shape, pair.target);
    } else {
      shape = filterStep(shape, parameter.queryToken);
    }
  }

  if (shape === undefined) return archetype.key;
  shape = filterStep(shape, archetype.id);
  if (shape.hash === undefined) filterCount++;
  return shape.hash ?? (shape.hash = computeQueryHash(archetype, parameters, base));
}

export const createQueryHash = (parameters: readonly QueryParameter[]): QueryHash =>
  hashShape(parameters, 0);
