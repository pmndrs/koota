import type { CommandBufferState as BufferHandle } from '../handles';
import { createKernelError } from '../errors';
import type { Entity } from '../entity/types';
import { cancelReservedEntity } from '../entity/entity-index';
import type { KernelContext } from '../context';

export const CommandKind = {
  Spawn: 0,
  Destroy: 1,
  Add: 2,
  Remove: 3,
  Set: 4,
  Changed: 5,
  AttachIdentity: 6,
  DetachIdentity: 7,
  WriteIdentity: 8,
} as const;

export interface CommandBufferState extends BufferHandle {
  /** Five integer words per command, with references held separately. */
  readonly words: number[];
  readonly payloads: any[];
  readonly context: KernelContext;
  readonly epoch: number;
  count: number;
  capacity: number;
  playing: boolean;
}

export function createBufferState(context: KernelContext, capacity = 64): CommandBufferState {
  const buffer = {
    words: [],
    payloads: [],
    context,
    epoch: context.commandEpoch,
    count: 0,
    capacity: 0,
    playing: false,
  } satisfies Omit<CommandBufferState, keyof BufferHandle> as unknown as CommandBufferState;
  reserveBuffer(buffer, capacity);
  return buffer;
}

export function clearBuffer(buffer: CommandBufferState): void {
  if (buffer.playing) throw createKernelError('BUFFER_CLEAR_DURING_PLAYBACK');
  if (buffer.epoch === buffer.context.commandEpoch) {
    for (let i = 0; i < buffer.count * 5; i += 5) {
      if (buffer.words[i] === CommandKind.Spawn) {
        cancelReservedEntity(buffer.context.entityIndex, buffer.words[i + 1] as Entity);
      }
    }
  }
  for (let i = 0; i < buffer.count * 2; i++) buffer.payloads[i] = undefined;
  buffer.count = 0;
}

export function getCommandCount(buffer: CommandBufferState): number {
  return buffer.count;
}

export function reserveBuffer(buffer: CommandBufferState, capacity: number): void {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity >= 0x10000000)
    throw new RangeError('Koota: Invalid command capacity.');
  while (buffer.words.length < capacity * 5) buffer.words.push(0);
  while (buffer.payloads.length < capacity * 2) buffer.payloads.push(undefined);
  buffer.capacity = Math.max(buffer.capacity, capacity);
}
