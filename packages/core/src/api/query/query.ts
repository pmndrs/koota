import {
  added,
  Any,
  changed,
  getQueryVersion as getKernelQueryVersion,
  not,
  or,
  pair,
  removed,
  resolveQuery as resolveKernelQuery,
  targets,
  type Query as KernelQuery,
  type Term,
  type TrackTerm,
  type TypeId,
} from '../../kernel';
import { toLocal } from '../handles';
import { isRelationPair } from '../relation/relation';
import { $internal, $parameters, $queryRef, type Brand } from '../symbols';
import { trait } from '../trait/trait';
import type { Trait } from '../trait/types';
import type { WorldState } from '../world/state';
import type { World } from '../world/types';
import { isModifier, trackingEvent } from './modifiers';
import type { Modifier, Query, QueryParameter } from './types';

/** Entities with this trait are hidden from every query. */
export const IsExcluded = trait();

const cachedQueries = new Map<string, Query<QueryParameter[]>>();
let queryId = 0;

export function isQuery(value: unknown): value is Query<QueryParameter[]> {
  return (value as Brand<typeof $queryRef> | null | undefined)?.[$queryRef] === true;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function hashParameter(parameter: QueryParameter, out: string[]): void {
  if (isRelationPair(parameter)) {
    const relation = parameter.relation[$internal].id;
    if (parameter.targetQuery) {
      const sub = isQuery(parameter.targetQuery)
        ? parameter.targetQuery.hash
        : hashParameters(parameter.targetQuery);
      out.push(`p${relation}?${sub}`);
    } else {
      out.push(`p${relation}:${parameter.target}`);
    }
    return;
  }
  if (isModifier(parameter)) {
    hashModifier(parameter, out);
    return;
  }
  out.push(`t${parameter[$internal].id}`);
}

function hashModifier(modifier: Modifier, out: string[]): void {
  if (modifier.type === 'not') {
    for (const item of modifier.traits) out.push(`!${item[$internal].id}`);
    return;
  }
  if (modifier.type === 'or') {
    const alternatives: string[] = [];
    for (const item of modifier.traits) alternatives.push(`t${item[$internal].id}`);
    for (const nested of modifier.modifiers ?? []) hashModifier(nested, alternatives);
    out.push(`|${alternatives.sort().join(',')}`);
    return;
  }
  const event = trackingEvent(modifier);
  const prefix = event === 'added' ? '+' : event === 'changed' ? '~' : '-';
  for (const item of modifier.traits) out.push(`${prefix}${item[$internal].id}:${modifier.id}`);
}

export function hashParameters(parameters: readonly QueryParameter[]): string {
  const out: string[] = [];
  for (let i = 0; i < parameters.length; i++) hashParameter(parameters[i], out);
  return out.sort().join(';');
}

export function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T> {
  const hash = hashParameters(parameters);
  const existing = cachedQueries.get(hash);
  if (existing) return existing as Query<T>;
  const query = Object.freeze({
    [$queryRef]: true,
    id: queryId++,
    hash,
    parameters,
    [$parameters]: parameters,
  }) as Query<T>;
  cachedQueries.set(hash, query as Query<QueryParameter[]>);
  return query;
}

// ---------------------------------------------------------------------------
// Term resolution
// ---------------------------------------------------------------------------

/** Kernel type for a trait or relation trait: relations resolve to their aggregate. */
function typeOfTrait(item: Trait): TypeId {
  const relation = item[$internal].relation;
  return relation ? pair(relation[$internal].id, Any) : item[$internal].id;
}

/** Returns null when a concrete pair targets a dead entity, so the query matches nothing. */
function resolveTerms(state: WorldState, parameters: readonly QueryParameter[]): Term[] | null {
  const terms: Term[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (isRelationPair(parameter)) {
      const relation = parameter.relation[$internal].id;
      if (parameter.targetQuery) {
        const subParameters = isQuery(parameter.targetQuery) ? parameter.targetQuery.parameters : parameter.targetQuery;
        const sub = resolveTerms(state, subParameters);
        if (sub === null) return null;
        terms.push(targets(relation, ...sub));
      } else if (parameter.target === '*') {
        terms.push(pair(relation, Any));
      } else {
        const local = toLocal(state, parameter.target as number);
        if (local === 0) return null;
        terms.push(pair(relation, local));
      }
      continue;
    }
    if (isModifier(parameter)) {
      if (parameter.type === 'not') {
        for (const item of parameter.traits) terms.push(not(typeOfTrait(item)));
      } else if (parameter.type === 'or') {
        const alternatives: (TypeId | TrackTerm)[] = [];
        for (const item of parameter.traits) alternatives.push(typeOfTrait(item));
        for (const nested of parameter.modifiers ?? []) {
          const event = trackingEvent(nested);
          if (!event) throw new Error('Koota: Or() only nests Added, Changed, and Removed modifiers.');
          for (const item of nested.traits) alternatives.push(trackTerm(event, typeOfTrait(item), nested));
        }
        terms.push(or(...alternatives));
      } else {
        const event = trackingEvent(parameter);
        if (!event) throw new Error('Koota: Unknown query modifier.');
        for (const item of parameter.traits) terms.push(trackTerm(event, typeOfTrait(item), parameter));
      }
      continue;
    }
    terms.push(typeOfTrait(parameter));
  }
  return terms;
}

function trackTerm(event: 'added' | 'changed' | 'removed', type: TypeId, modifier: Modifier): TrackTerm {
  const tracker = modifier.tracker!;
  return event === 'added' ? added(type, tracker) : event === 'changed' ? changed(type, tracker) : removed(type, tracker);
}

/** Resolves the kernel query for parameters in a registered world, or null when it can match nothing. */
export function resolveQuery(state: WorldState, parameters: readonly QueryParameter[], hash?: string): KernelQuery | null {
  const key = hash ?? hashParameters(parameters);
  let query = state.queries.get(key);
  if (query) return query;
  const terms = resolveTerms(state, parameters);
  if (terms === null) return null;
  query = resolveKernelQuery(state.kernel!, terms);
  state.queries.set(key, query);
  return query;
}

/** Read query membership revision without creating a query or consuming tracking results. */
export function getQueryVersion(world: World, query: Query): number | undefined {
  const state = (world as unknown as { [$internal]: WorldState })[$internal];
  if (!state.kernel) return undefined;
  const resolved = state.queries.get(query.hash);
  if (!resolved) return undefined;
  return getKernelQueryVersion(state.kernel, resolved);
}
