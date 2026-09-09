const $kernelError = Symbol('kernelError');

export type KernelErrorCode =
  | 'CONTEXT_RESET_DURING_MUTATION'
  | 'CONTEXT_DESTROY_DURING_MUTATION'
  | 'BUFFER_CONTEXT_MISMATCH'
  | 'BUFFER_CONTEXT_EXPIRED'
  | 'FLUSH_DURING_MUTATION'
  | 'BUFFER_DUPLICATED'
  | 'BUFFER_RECORD_DURING_PLAYBACK'
  | 'BUFFER_CLEAR_DURING_PLAYBACK';

export type KernelError = Error & {
  readonly [$kernelError]: true;
  readonly code: KernelErrorCode;
};

export function createKernelError(code: KernelErrorCode): KernelError {
  return Object.assign(new Error(code), { [$kernelError]: true as const, code });
}

export function isKernelError(error: unknown): error is KernelError {
  return error instanceof Error && $kernelError in error;
}
