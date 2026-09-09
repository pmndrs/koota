import { $internal } from '../common';
import { isRelationPair } from '../relation/is-relation';
import { isModifier, isOrWithModifiers } from './modifier';
import { isQuery } from './is-query';
import type { QueryHash, QueryParameter } from './types';

export function createQueryHashWorkspace(capacity = 1024) {
  return { values: new Float64Array(capacity), size: 0, busy: false };
}

// Only the nonrecursive entry point borrows this workspace.
const _query_hashWorkspace = /* @__PURE__ */ createQueryHashWorkspace();
const _query_termIds = /* @__PURE__ */ new Map<string, number>();
const _query_descriptorIds = /* @__PURE__ */ new WeakMap<object, number | number[]>();

/** Plain traits use nonnegative IDs. Structured terms occupy a separate negative namespace. */
function termId(parameter: QueryParameter): number | number[] {
  if (!isRelationPair(parameter) && !isModifier(parameter)) return parameter[$internal].id;
  let id = _query_descriptorIds.get(parameter);
  if (id !== undefined) return id;
  if (isModifier(parameter) && parameter.type !== 'or') {
    const ids: number[] = [];
    for (let i = 0; i < parameter.traitIds.length; i++)
      ids[i] = internTerm(`m${parameter.type}:${parameter.id}:${parameter.traitIds[i]}`);
    id = ids.length === 1 ? ids[0] : ids;
    _query_descriptorIds.set(parameter, id);
    return id;
  }
  let key: string;
  if (isRelationPair(parameter)) {
    const relation = parameter.relation[$internal].trait[$internal].id;
    if (parameter.targetQuery) {
      const target = parameter.targetQuery;
      const hash = isQuery(target)
        ? target.hash
        : createQueryHash(target, createQueryHashWorkspace(target.length));
      key = `r${relation}?${hash}`;
    } else key = `r${relation}>${parameter.target}`;
  } else {
    const terms: QueryParameter[] = parameter.traits.slice();
    if (isOrWithModifiers(parameter))
      for (const modifier of parameter.modifiers) terms[terms.length] = modifier;
    key = `m${parameter.type}:${parameter.id}(${createQueryHash(terms, createQueryHashWorkspace(terms.length))})`;
  }
  id = internTerm(key);
  _query_descriptorIds.set(parameter, id);
  return id;
}

function internTerm(key: string): number {
  let id = _query_termIds.get(key);
  if (id === undefined) {
    if (_query_termIds.size >= 0x3ffffffe)
      throw new RangeError('Koota: Query term capacity exhausted.');
    id = -_query_termIds.size - 1;
    _query_termIds.set(key, id);
  }
  return id;
}

/** Descriptors are immutable definitions. Compile once and reuse query handles in hot loops. */
export function createQueryHash(
  parameters: readonly QueryParameter[],
  workspace = _query_hashWorkspace
): QueryHash {
  let capacity = parameters.length;
  for (const parameter of parameters)
    if (isModifier(parameter) && parameter.type !== 'or') capacity += parameter.traitIds.length - 1;
  if (workspace.busy || workspace.values.length < capacity)
    workspace = createQueryHashWorkspace(capacity);
  workspace.busy = true;
  workspace.size = 0;
  const values = workspace.values;
  try {
    for (let i = 0; i < parameters.length; i++) {
      const ids = termId(parameters[i]);
      if (typeof ids === 'number') values[workspace.size++] = ids;
      else for (let j = 0; j < ids.length; j++) values[workspace.size++] = ids[j];
    }
    const count = workspace.size;
    // Small queries avoid sort views and temporary arrays. Larger queries use bounded heap sort.
    if (count <= 16) {
      for (let i = 1; i < count; i++) {
        const value = values[i];
        let j = i;
        while (j > 0 && values[j - 1] > value) {
          values[j] = values[j - 1];
          j--;
        }
        values[j] = value;
      }
    } else {
      for (let i = (count >>> 1) - 1; i >= 0; i--) sift(values, i, count);
      for (let end = count - 1; end > 0; end--) {
        const value = values[0];
        values[0] = values[end];
        values[end] = value;
        sift(values, 0, end);
      }
    }
    let hash = count ? String(values[0]) : '';
    for (let i = 1; i < count; i++) hash += ',' + values[i];
    return hash;
  } finally {
    workspace.size = 0;
    workspace.busy = false;
  }
}

function sift(values: Float64Array, root: number, count: number): void {
  const value = values[root];
  for (let child = root * 2 + 1; child < count; child = root * 2 + 1) {
    if (child + 1 < count && values[child] < values[child + 1]) child++;
    if (value >= values[child]) break;
    values[root] = values[child];
    root = child;
  }
  values[root] = value;
}
