import { isKernelError, type KernelErrorCode } from '../kernel';

/** Translate engine failures while preserving exceptions from application code. */
export function rethrowPublicError(error: unknown): never {
  if (!isKernelError(error)) throw error;
  throw new Error(formatKernelError(error.code), { cause: error });
}

function formatKernelError(code: KernelErrorCode): string {
  switch (code) {
    case 'CONTEXT_RESET_DURING_MUTATION':
      return 'Koota: Cannot reset a world during a mutation.';
    case 'CONTEXT_DESTROY_DURING_MUTATION':
      return 'Koota: Cannot destroy a world during a mutation.';
    case 'BUFFER_CONTEXT_MISMATCH':
      return "Koota: Cannot flush another world's command buffer.";
    case 'BUFFER_CONTEXT_EXPIRED':
      return 'Koota: Command buffer belongs to a reset or destroyed world.';
    case 'FLUSH_DURING_MUTATION':
      return 'Koota: Cannot flush during a mutation or another flush.';
    case 'BUFFER_DUPLICATED':
      return 'Koota: Cannot flush the same command buffer twice in one call.';
    case 'BUFFER_RECORD_DURING_PLAYBACK':
      return 'Koota: Cannot record into a command buffer during playback.';
    case 'BUFFER_CLEAR_DURING_PLAYBACK':
      return 'Koota: Cannot clear a command buffer during playback.';
  }
}
