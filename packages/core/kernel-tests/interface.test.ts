import { expect, expectTypeOf, it } from 'vitest';
import {
  createBufferState,
  createKernelContext,
  getKernelCleanupToken,
  initializeKernel,
  defineTrait,
  prepareEntityAccess,
  prepareQueryPlan,
  createQueryWorkspace,
  prepareSpawnPlan,
  readPreparedValues,
  resolveQuery,
  type CommandBufferState,
  type KernelContext,
  type PageCleanupToken,
  type QueryInstance,
  type PreparedAccess,
  type QueryPlan,
  type QueryWorkspace,
  type SpawnPlan,
} from '../src/kernel';
import { createKernelContext as createEngineContext, destroyKernel } from '../src/kernel/context';
import { createBufferState as createEngineBuffer } from '../src/kernel/commands/buffer-state';
import { resolveQuery as resolveEngineQuery } from '../src/kernel/query/observe';

it('hides engine records while passing the same handles to kernel operations', () => {
  expectTypeOf<Extract<keyof KernelContext, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof QueryInstance, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof CommandBufferState, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof PageCleanupToken, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof PreparedAccess, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof QueryPlan, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof QueryWorkspace, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof SpawnPlan, string>>().toEqualTypeOf<never>();
  expect(createKernelContext).toBe(createEngineContext);
  expect(createBufferState).toBe(createEngineBuffer);
  expect(resolveQuery).toBe(resolveEngineQuery);

  const engine = createEngineContext();
  const ctx: KernelContext = engine;
  try {
    initializeKernel(ctx);
    const query = resolveQuery(ctx, []);
    expect(query).toBe(resolveEngineQuery(engine, []));
    expect(getKernelCleanupToken(ctx)).toBe(engine.cleanupToken);
    expectTypeOf(createBufferState(ctx)).toEqualTypeOf<CommandBufferState>();
    expectTypeOf(query).toEqualTypeOf<QueryInstance>();
    const value = defineTrait(ctx, { x: 0 });
    const access = prepareEntityAccess(ctx, value);
    expectTypeOf(access).toEqualTypeOf<PreparedAccess>();
    expectTypeOf(prepareQueryPlan(ctx, [value])).toEqualTypeOf<QueryPlan>();
    expectTypeOf(createQueryWorkspace(0)).toEqualTypeOf<QueryWorkspace>();
    expectTypeOf(prepareSpawnPlan(ctx, [value])).toEqualTypeOf<SpawnPlan>();
    expectTypeOf<Parameters<typeof readPreparedValues>[2]>().toEqualTypeOf<any[] | Float64Array>();
  } finally {
    destroyKernel(engine);
  }
});
