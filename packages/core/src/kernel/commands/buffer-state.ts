import { createKernelError } from '../errors';
import type { Entity } from '../entity/types';
import { cancelReservedEntity } from '../entity/entity-index';
import type { KernelContext } from '../context';

export const CommandKind = { Spawn: 0, Destroy: 1, Add: 2, Remove: 3, Set: 4, Changed: 5 } as const;

export interface CommandBufferState {
  /** Five integer words per command, with references held separately. */
  readonly words: number[];
  readonly payloads: any[];
  readonly context: KernelContext;
  readonly epoch: number;
  playing: boolean;
}

export function createBufferState(context: KernelContext): CommandBufferState {
  return { words: [], payloads: [], context, epoch: context.commandEpoch, playing: false };
}

export function clearBuffer(buffer: CommandBufferState): void {
  if (buffer.playing) throw createKernelError('BUFFER_CLEAR_DURING_PLAYBACK');
  if (buffer.epoch === buffer.context.commandEpoch) {
    for (let i = 0; i < buffer.words.length; i += 5) {
      if (buffer.words[i] === CommandKind.Spawn) {
        cancelReservedEntity(buffer.context.entityIndex, buffer.words[i + 1] as Entity);
      }
    }
  }
  buffer.words.length = 0;
  buffer.payloads.length = 0;
}
