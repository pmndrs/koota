import type { KernelContext } from '../context';
import type { SpawnPlan as SpawnHandle } from '../handles';
import type { Entity } from './types';
import { isEntityAlive } from './entity-index';
import { beginSpawnEntity } from '../commands/handlers/entity';
import { $internal } from '../common';
import {
  prepareEntityAccess,
  applyPreparedAttachment,
  attachmentPrepared,
  type PreparedAccess,
} from './prepared-access';
import { abortMutation, finishMutation } from '../commands/lifecycle';

export type SpawnPlan = SpawnHandle & {
  ctx: KernelContext;
  epoch: number;
  accesses: PreparedAccess[];
  memberships: number;
};

/** Compile a fixed initial membership set. Defaults and hooks retain their schema behavior. */
export function prepareSpawnPlan(ctx: KernelContext, predicates: readonly Entity[]): SpawnPlan {
  if (ctx.mutationDepth) throw new Error('Koota: Spawns must be prepared outside mutations.');
  const accesses: PreparedAccess[] = [];
  const seen = new Set<Entity>();
  const relations = new Set<Entity>();
  let memberships = 0;
  for (let i = 0; i < predicates.length; i++) {
    const predicate = predicates[i];
    if (seen.has(predicate)) continue;
    seen.add(predicate);
    const access = prepareEntityAccess(ctx, predicate);
    if (access.kind === 2) throw new Error('Koota: Spawns require concrete relation pairs.');
    if (access.pair) {
      const relation = access.instance.entity;
      if (relations.has(relation) && access.pair.relation[$internal].exclusive)
        throw new Error('Koota: A spawn cannot contain multiple exclusive targets.');
      if (!relations.has(relation)) {
        relations.add(relation);
        memberships++;
      }
    }
    accesses[accesses.length] = access;
    memberships++;
  }
  return { ctx, epoch: ctx.commandEpoch, accesses, memberships } satisfies Omit<
    SpawnPlan,
    keyof SpawnHandle
  > as unknown as SpawnPlan;
}

/** Creates a capacity-limited prefix. -1 is an invalid plan and -2 is nested execution. */
export function trySpawnBatch(
  plan: SpawnPlan,
  output: Uint32Array | number[],
  count = output.length
): number {
  const ctx = plan.ctx;
  if (!Number.isInteger(count) || count < 0 || count > output.length)
    throw new RangeError('Koota: Invalid spawn count.');
  if (ctx.mutationDepth || ctx.flushing) return -2;
  if (plan.epoch !== ctx.commandEpoch || !ctx.cleanupToken.registered) return -1;
  for (let i = 0; i < plan.accesses.length; i++)
    if (!isEntityAlive(ctx.entityIndex, plan.accesses[i].predicate)) return -1;
  const index = ctx.entityIndex;
  let limit = Math.min(count, index.dense.length - index.aliveCount);
  if (plan.memberships)
    limit = Math.min(
      limit,
      Math.floor((ctx.memberships.capacity - ctx.memberships.count) / plan.memberships)
    );
  if (limit === 0) return 0;
  for (let i = 0; i < plan.accesses.length; i++) {
    const access = plan.accesses[i];
    if (!access.pair) continue;
    const pages = Math.ceil((ctx.memberships.capacity + 1) / 1024);
    for (let field = 0; field < access.columns.length; field++)
      for (let page = 0; page < pages; page++) if (!access.columns[field][page]) return 0;
  }
  let created = 0;
  ctx.mutationDepth++;
  try {
    for (; created < limit; created++) {
      const next = index.dense[index.aliveCount];
      let prepared = true;
      for (let i = 0; i < plan.accesses.length; i++) {
        const access = plan.accesses[i];
        if (!attachmentPrepared(access, next, access.pair ? 2 : 1)) {
          prepared = false;
          break;
        }
      }
      if (!prepared) break;
      const entity = beginSpawnEntity(ctx);
      output[created] = entity;
      for (let i = 0; i < plan.accesses.length; i++)
        applyPreparedAttachment(plan.accesses[i], entity);
      for (const callback of ctx.entitySpawnSubscriptions) callback(entity);
    }
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return created;
}
