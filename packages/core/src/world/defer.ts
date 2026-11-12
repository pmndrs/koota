import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/utils/entity-index';
import { settle } from './settled';
import type { WorldContext } from './types';

/** Applies one structural change. The log stores it with its entity and two arguments. */
export type Command = (ctx: WorldContext, entity: Entity, a: any, b: any) => void;

/**
 * A defer scope holds the world's defer depth. Every structural operation opens one around its
 * work and its hooks, every callback walk opens one around its callbacks and world.defer opens
 * one around a function. Each owner is a call frame, so every scope ends. A for...of loop has no
 * such owner and opens none. While the depth is nonzero, add, remove, destroy and machine
 * transitions append to the command log instead of running, so an operation completes before the
 * changes its hooks make and a walk never loses a row or the data under it. When the outermost
 * scope ends the log applies in call order and the settled observers run.
 */
export /* @inline */ function beginDefer(ctx: WorldContext) {
  ctx.deferDepth++;
}

/** Commands and queued observers both raise unsettled, so a scope end reads one field. */
export /* @inline */ function endDefer(ctx: WorldContext) {
  if (--ctx.deferDepth === 0 && ctx.unsettled) settleWorld(ctx);
}

/**
 * The outermost scope of an entry point, which has already checked that the depth is zero, so it
 * writes the depth constants instead of counting.
 */
export /* @inline */ function beginRootDefer(ctx: WorldContext) {
  ctx.deferDepth = 1;
}

export /* @inline */ function endRootDefer(ctx: WorldContext) {
  ctx.deferDepth = 0;
  if (ctx.unsettled) settleWorld(ctx);
}

/** Runs a function inside a defer scope and returns its result. */
export function runDeferred<T>(ctx: WorldContext, fn: () => T): T {
  ctx.deferDepth++;
  try {
    return fn();
  } finally {
    endDefer(ctx);
  }
}

/** Appends a command as four flat entries, so deferring allocates nothing per call. */
export function deferCommand(
  ctx: WorldContext,
  apply: Command,
  entity: Entity,
  a: unknown,
  b: unknown
) {
  const commands = ctx.commands;
  const count = ctx.commandCount;
  commands[count] = apply;
  commands[count + 1] = entity;
  commands[count + 2] = a;
  commands[count + 3] = b;
  ctx.commandCount = count + 4;
  ctx.unsettled = true;
}

/**
 * The gate of an entry point off the hot path. Inside a scope the command joins the log. Outside
 * one it applies under a root scope, so a command always applies with the depth held.
 */
export function runCommand(
  ctx: WorldContext,
  apply: Command,
  entity: Entity,
  a: unknown,
  b: unknown
) {
  if (ctx.deferDepth !== 0) deferCommand(ctx, apply, entity, a, b);
  else {
    beginRootDefer(ctx);
    try {
      apply(ctx, entity, a, b);
    } finally {
      endRootDefer(ctx);
    }
  }
}

/**
 * Applies the log in waves. A wave is the commands queued so far and hooks append to the next
 * one, so a chain of hook driven changes costs one wave per link. Observers run once the log is
 * empty and their changes start the next round. The wave limit only stops a hook that undoes the
 * change it observes, where a recursive call would have overflowed the stack. Errors are recorded
 * while both queues finish, then the first error is rethrown.
 */
export function settleWorld(ctx: WorldContext) {
  let waves = 0;
  let rounds = 0;
  let head = 0;
  let failed = false;
  let failure: unknown;
  const commands = ctx.commands;
  ctx.deferDepth++;
  try {
    for (;;) {
      const end = ctx.commandCount;
      if (head < end) {
        if (++waves > 100000) {
          throw new Error(
            'Koota: Deferred changes did not settle after 100000 waves. A hook is likely undoing the change it observes.'
          );
        }
        for (; head < end; head += 4) {
          const entity = commands[head + 1] as Entity;
          if (!isEntityAlive(ctx.entityIndex, entity)) continue;
          try {
            (commands[head] as Command)(ctx, entity, commands[head + 2], commands[head + 3]);
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
        }
        continue;
      }
      if (end !== 0) {
        clearCommands(ctx);
        head = 0;
      }
      // Most drains queue no observer, so they end here without a round.
      if (ctx.settledQueue.size === 0) break;
      if (++rounds > 100) {
        throw new Error(
          'Koota: Settled observers did not settle after 100 rounds. An observer is likely changing the state it observes.'
        );
      }
      try {
        settle(ctx);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  } finally {
    // Only a limit error leaves work behind. Clearing a Set allocates a new table, so the usual
    // empty queue is skipped.
    if (ctx.commandCount !== 0) clearCommands(ctx);
    if (ctx.settledQueue.size !== 0) ctx.settledQueue.clear();
    ctx.unsettled = false;
    ctx.deferDepth--;
  }
  if (failed) throw failure;
}

/** Clearing in place drops the references and keeps the store a length write would release. */
function clearCommands(ctx: WorldContext) {
  const commands = ctx.commands;
  const count = ctx.commandCount;
  for (let i = 0; i < count; i++) commands[i] = undefined;
  ctx.commandCount = 0;
}

/** World wide operations cannot run while a scope may still hold commands. */
export function assertOutsideDefer(ctx: WorldContext, operation: string) {
  if (ctx.deferDepth !== 0) {
    throw new Error(
      `Koota: [DEFER_SCOPE] ${operation} cannot run inside a walk, a hook or world.defer. Finish the scope first.`
    );
  }
}
