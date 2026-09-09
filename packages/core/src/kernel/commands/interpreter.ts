import { createKernelError } from '../errors';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/entity-index';
import { applyChanged, applyPairChanged } from './handlers/changed';
import { applyDestroyEntity, applySpawnEntity } from './handlers/entity';
import { applyAddTrait, applyRemoveTrait, applySetTrait } from './handlers/trait';
import { abortMutation, finishMutation } from './lifecycle';
import type { KernelContext } from '../context';
import { clearBuffer, CommandKind, type CommandBufferState } from './buffer-state';

/** Apply buffers in caller order, then drain mutations requested by lifecycle callbacks. */
export function flushCommands(ctx: KernelContext, ...buffers: CommandBufferState[]): void {
  if (ctx.mutationDepth > 0 || ctx.flushing) throw createKernelError('FLUSH_DURING_MUTATION');
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    if (buffer.context !== ctx) throw createKernelError('BUFFER_CONTEXT_MISMATCH');
    if (buffer.epoch !== ctx.commandEpoch) throw createKernelError('BUFFER_CONTEXT_EXPIRED');
    if (buffers.indexOf(buffer) !== i) throw createKernelError('BUFFER_DUPLICATED');
  }
  ctx.flushing = true;
  for (const buffer of buffers) buffer.playing = true;
  try {
    for (const buffer of buffers) interpretBuffer(ctx, buffer);
    while (ctx.pendingCommands?.count) {
      const pending = ctx.pendingCommands;
      ctx.pendingCommands = ctx.spareCommands;
      ctx.spareCommands = null;
      pending.playing = true;
      try {
        interpretBuffer(ctx, pending);
      } finally {
        pending.playing = false;
        clearBuffer(pending);
        ctx.spareCommands = pending;
      }
    }
  } finally {
    for (const buffer of buffers) {
      buffer.playing = false;
      clearBuffer(buffer);
    }
    if (ctx.pendingCommands) clearBuffer(ctx.pendingCommands);
    ctx.flushing = false;
  }
}

function interpretBuffer(ctx: KernelContext, buffer: CommandBufferState): void {
  const words = buffer.words;
  const payloads = buffer.payloads;
  for (let i = 0; i < buffer.count * 5; i += 5) {
    const kind = words[i];
    const entity = words[i + 1] as Entity;
    if (kind !== CommandKind.Spawn && !isEntityAlive(ctx.entityIndex, entity)) continue;
    if (kind >= CommandKind.AttachIdentity && !isEntityAlive(ctx.entityIndex, words[i + 4])) continue;
    const operand = payloads[words[i + 2]];
    const value = payloads[words[i + 3]];
    ctx.mutationDepth++;
    try {
      switch (kind) {
        case CommandKind.Spawn:
          applySpawnEntity(ctx, operand, entity);
          break;
        case CommandKind.Destroy:
          applyDestroyEntity(ctx, entity);
          break;
        case CommandKind.Add:
        case CommandKind.AttachIdentity:
          applyAddTrait(ctx, entity, operand, value);
          break;
        case CommandKind.Remove:
        case CommandKind.DetachIdentity:
          applyRemoveTrait(ctx, entity, operand);
          break;
        case CommandKind.Set:
        case CommandKind.WriteIdentity:
          applySetTrait(
            ctx,
            entity,
            operand,
            value,
            kind === CommandKind.WriteIdentity || words[i + 4] !== 0
          );
          break;
        case CommandKind.Changed:
          if (value === undefined) applyChanged(ctx, entity, operand);
          else applyPairChanged(ctx, entity, operand, value);
          break;
      }
    } catch (error) {
      abortMutation(ctx);
      throw error;
    }
    finishMutation(ctx);
  }
}
