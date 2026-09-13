const $kootaError = Symbol('kootaError');

export type ErrorCode =
  | 'CONTEXT_RESET_DURING_MUTATION'
  | 'CONTEXT_DESTROY_DURING_MUTATION'
  | 'BUFFER_CONTEXT_MISMATCH'
  | 'BUFFER_CONTEXT_EXPIRED'
  | 'FLUSH_DURING_MUTATION'
  | 'BUFFER_DUPLICATED'
  | 'BUFFER_RECORD_DURING_PLAYBACK'
  | 'BUFFER_CLEAR_DURING_PLAYBACK';

export type InternalError = Error & { readonly [$kootaError]: true; readonly code: ErrorCode };

export function createInternalError(code: ErrorCode): InternalError {
  return Object.assign(new Error(code), { [$kootaError]: true as const, code });
}

export function isInternalError(error: unknown): error is InternalError {
  return error instanceof Error && $kootaError in error;
}

function formatError(code: ErrorCode): string {
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

/** Translate lifecycle failures while preserving exceptions from application code. */
export function rethrowPublicError(error: unknown): never {
  if (!isInternalError(error)) throw error;
  throw new Error(formatError(error.code), { cause: error });
}

export function throwPublicError(code: ErrorCode): never {
  rethrowPublicError(createInternalError(code));
}
