import type { KernelContext } from '../context';
import { abortMutation, finishMutation } from '../commands/lifecycle';
import type { QueryInstance } from './types';
import type { QueryWorkspace as WorkspaceHandle } from '../handles';
import type { PreparedAccess, ValueColumn } from '../entity/prepared-access';
import { preparedRow } from '../entity/prepared-access';
import { publishChangedBatch } from '../commands/handlers/changed';
import { collectQueryPlanInto, isQueryPlanValid, type QueryPlan } from './query-plan';

/** Borrowed query entities stay valid during the callback. Structural edits drain after iteration. */
export function visitQuery(
  ctx: KernelContext,
  query: QueryInstance,
  callback: (entities: Readonly<ArrayLike<number>>, count: number) => void
): void {
  if (query.ctx !== ctx || query.isTracking)
    throw new Error('Koota: Visiting requires a static query from this context.');
  visitEntities(ctx, query.entities.dense, query.entities.size, callback, null);
}

export type QueryWorkspace = WorkspaceHandle & {
  entities: Uint32Array;
  rows: Uint32Array;
  count: number;
  busy: boolean;
  plan: QueryPlan | null;
  revision: number;
  access: PreparedAccess | null;
};

export function createQueryWorkspace(capacity: number): QueryWorkspace {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 0x400000)
    throw new RangeError('Koota: Invalid query workspace capacity.');
  return {
    entities: new Uint32Array(capacity),
    rows: new Uint32Array(capacity),
    count: 0,
    busy: false,
    plan: null,
    revision: -1,
    access: null,
  } satisfies Omit<QueryWorkspace, keyof WorkspaceHandle> as unknown as QueryWorkspace;
}

/** Insufficient capacity skips the callback. Nested visits require distinct workspaces. */
export function visitQueryPlan(
  plan: QueryPlan,
  workspace: QueryWorkspace,
  callback: (entities: Readonly<ArrayLike<number>>, count: number) => void
): number {
  if (workspace.busy) throw new Error('Koota: Query workspace is already borrowed.');
  const count = refreshWorkspace(plan, workspace);
  if (count <= 0 || count > workspace.entities.length) return count;
  visitEntities(plan.ctx, workspace.entities, count, callback, workspace);
  return count;
}

/** Static and planned entity visits share the same borrow and mutation boundary. */
function visitEntities(
  ctx: KernelContext,
  entities: Readonly<ArrayLike<number>>,
  count: number,
  callback: (entities: Readonly<ArrayLike<number>>, count: number) => void,
  workspace: QueryWorkspace | null
): void {
  if (workspace) workspace.busy = true;
  ctx.mutationDepth++;
  ctx.iterationDepth++;
  try {
    if (count) callback(entities, count);
  } catch (error) {
    ctx.iterationDepth--;
    if (workspace) workspace.busy = false;
    abortMutation(ctx);
    throw error;
  }
  ctx.iterationDepth--;
  if (workspace) workspace.busy = false;
  finishMutation(ctx);
}

export type ColumnPublication = 'read' | 'silent' | 'changed';

/** Caller-owned results refresh on structural edits, without maintaining per-query sets. */
function refreshWorkspace(plan: QueryPlan, workspace: QueryWorkspace): number {
  const ctx = plan.ctx;
  if (
    ctx.mutationDepth ||
    workspace.plan !== plan ||
    workspace.revision !== ctx.memberships.version
  ) {
    const count = collectQueryPlanInto(plan, workspace.entities);
    if (count < 0) return count;
    workspace.count = count;
    workspace.plan = plan;
    workspace.revision = ctx.mutationDepth ? -1 : ctx.memberships.version;
    workspace.access = null;
  } else if (!isQueryPlanValid(plan)) return -1;
  return workspace.count;
}

/** Rows address the borrowed paged columns. Publication occurs after all callback writes. */
export function visitQueryColumns(
  plan: QueryPlan,
  access: PreparedAccess,
  workspace: QueryWorkspace,
  callback: (
    entities: Readonly<ArrayLike<number>>,
    rows: Readonly<ArrayLike<number>>,
    columns: readonly ValueColumn[],
    count: number
  ) => void,
  publication: ColumnPublication = 'read'
): number {
  if (workspace.busy) throw new Error('Koota: Query workspace is already borrowed.');
  let required = false;
  for (let i = 0; i < plan.all.length; i++)
    if (plan.all[i].predicate === access.predicate) required = true;
  if (access.ctx !== plan.ctx || access.kind === 2 || !required)
    throw new Error('Koota: Column access must be required by the query plan.');
  if (publication !== 'read' && publication !== 'silent' && publication !== 'changed')
    throw new Error('Koota: Invalid column publication policy.');
  const count = refreshWorkspace(plan, workspace);
  if (count <= 0 || count > workspace.entities.length) return count;
  if (workspace.access !== access) {
    for (let i = 0; i < count; i++) workspace.rows[i] = preparedRow(access, workspace.entities[i]);
    workspace.access = access;
  }
  const ctx = plan.ctx;
  workspace.busy = true;
  ctx.mutationDepth++;
  ctx.iterationDepth++;
  if (publication !== 'read') access.instance.version++;
  try {
    callback(workspace.entities, workspace.rows, access.columns, count);
    if (publication === 'changed')
      publishChangedBatch(ctx, workspace.entities, count, access.instance, access.pair?.target);
  } catch (error) {
    ctx.iterationDepth--;
    workspace.busy = false;
    abortMutation(ctx);
    throw error;
  }
  ctx.iterationDepth--;
  workspace.busy = false;
  finishMutation(ctx);
  return count;
}
