import type { KernelContext } from '../context';
import type { QueryPlan as PlanHandle } from '../handles';
import type { Entity } from '../entity/types';
import { countUsers, firstUser, findMembership } from '../entity/membership';
import { isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/pack-entity';
import { prepareEntityAccess, type PreparedAccess } from '../entity/prepared-access';
import { getDefinitionEntity } from '../entity/definitions';

export type QueryPlanOptions = {
  none?: readonly Entity[];
  any?: readonly Entity[];
  includeImplicit?: boolean;
};

export type QueryPlan = PlanHandle & {
  ctx: KernelContext;
  epoch: number;
  all: PreparedAccess[];
  accesses: PreparedAccess[];
  generations: number[];
  required: number[];
  forbidden: number[];
  alternatives: number[];
  requiredPairs: Entity[];
  forbiddenPairs: Entity[];
  alternativePairs: Entity[];
  needsAlternative: boolean;
  includeImplicit: boolean;
};

/** A plan owns matching instructions, with no materialized results or mutation subscriptions. */
export function prepareQueryPlan(
  ctx: KernelContext,
  all: readonly Entity[],
  options: QueryPlanOptions = {}
): QueryPlan {
  if (ctx.mutationDepth) throw new Error('Koota: Queries must be prepared outside mutations.');
  const plan: QueryPlan = {
    ctx,
    epoch: ctx.commandEpoch,
    all: [],
    accesses: [],
    generations: [],
    required: [],
    forbidden: [],
    alternatives: [],
    requiredPairs: [],
    forbiddenPairs: [],
    alternativePairs: [],
    needsAlternative: Boolean(options.any?.length),
    includeImplicit: options.includeImplicit ?? false,
  } satisfies Omit<QueryPlan, keyof PlanHandle> as unknown as QueryPlan;
  compileTerms(plan, all, plan.required, plan.requiredPairs, true);
  if (options.none) compileTerms(plan, options.none, plan.forbidden, plan.forbiddenPairs, false);
  if (options.any) compileTerms(plan, options.any, plan.alternatives, plan.alternativePairs, false);
  if (ctx.queryExclusions) {
    const excluded = ctx.queryExclusions.map((trait) => getDefinitionEntity(ctx, trait));
    compileTerms(plan, excluded, plan.forbidden, plan.forbiddenPairs, false);
  }
  return plan;
}

function compileTerms(
  plan: QueryPlan,
  terms: readonly Entity[],
  masks: number[],
  pairs: Entity[],
  required: boolean
): void {
  for (let i = 0; i < terms.length; i++) {
    const access = prepareEntityAccess(plan.ctx, terms[i]);
    plan.accesses[plan.accesses.length] = access;
    if (required) plan.all[plan.all.length] = access;
    if (access.pair) {
      pairs[pairs.length] = access.predicate;
      continue;
    }
    let index = plan.generations.indexOf(access.instance.generationId);
    if (index === -1) {
      index = plan.generations.length;
      plan.generations[index] = access.instance.generationId;
      plan.required[index] = 0;
      plan.forbidden[index] = 0;
      plan.alternatives[index] = 0;
    }
    masks[index] |= access.instance.bitflag;
  }
}

export function isQueryPlanValid(plan: QueryPlan): boolean {
  if (plan.epoch !== plan.ctx.commandEpoch || !plan.ctx.cleanupToken.registered) return false;
  const index = plan.ctx.entityIndex;
  for (let i = 0; i < plan.accesses.length; i++)
    if (!isEntityAlive(index, plan.accesses[i].predicate)) return false;
  return true;
}

function matchesPlan(plan: QueryPlan, entity: Entity): boolean {
  const ctx = plan.ctx;
  if (!plan.includeImplicit && ctx.implicitEntities.has(entity)) return false;
  const id = getEntityId(entity);
  const page = id >>> 10;
  const offset = id & 1023;
  let alternative = !plan.needsAlternative;
  for (let i = 0; i < plan.generations.length; i++) {
    const mask = ctx.entityMasks[plan.generations[i]][page][offset];
    if ((mask & plan.required[i]) !== plan.required[i] || mask & plan.forbidden[i]) return false;
    if (mask & plan.alternatives[i]) alternative = true;
  }
  const edges = ctx.memberships;
  for (let i = 0; i < plan.requiredPairs.length; i++)
    if (!findMembership(edges, entity, plan.requiredPairs[i])) return false;
  for (let i = 0; i < plan.forbiddenPairs.length; i++)
    if (findMembership(edges, entity, plan.forbiddenPairs[i])) return false;
  if (!alternative)
    for (let i = 0; i < plan.alternativePairs.length; i++)
      if (findMembership(edges, entity, plan.alternativePairs[i])) return true;
  return alternative;
}

/** Writes the caller capacity, returns the required count, or -1 for an invalidated plan. */
export function collectQueryPlanInto(plan: QueryPlan, output: Uint32Array | number[]): number {
  if (!isQueryPlanValid(plan)) return -1;
  return collectPlan(plan, output);
}

function collectPlan(plan: QueryPlan, output: Uint32Array | number[]): number {
  const ctx = plan.ctx;
  const edges = ctx.memberships;
  let candidate = -1;
  let count = ctx.entityIndex.aliveCount;
  for (let i = 0; i < plan.all.length; i++) {
    const predicate = plan.all[i].predicate;
    const users = countUsers(edges, predicate);
    if (users < count) {
      candidate = predicate;
      count = users;
    }
  }
  let size = 0;
  const capacity = output.length;
  if (candidate !== -1 && count * 4 < ctx.entityIndex.aliveCount && !ctx.mutationDepth) {
    for (let edge = firstUser(edges, candidate); edge; edge = edges.nextUser[edge]) {
      const entity = edges.subjects[edge];
      if (!matchesPlan(plan, entity)) continue;
      if (size < capacity) output[size] = entity;
      size++;
    }
  } else {
    const entities = ctx.entityIndex.dense;
    for (let i = 0; i < ctx.entityIndex.aliveCount; i++) {
      const entity = entities[i];
      if (!matchesPlan(plan, entity)) continue;
      if (size < capacity) output[size] = entity;
      size++;
    }
  }
  return size;
}
