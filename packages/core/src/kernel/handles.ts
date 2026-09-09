declare const $kernelHandle: unique symbol;

/** Type-only identities. Engine records are passed directly without allocating wrappers. */
type Handle<T extends string> = { readonly [$kernelHandle]: T };

export type KernelContext = Handle<'context'>;
export type QueryInstance = Handle<'query'>;
export type CommandBufferState = Handle<'buffer'>;
export type PageCleanupToken = Handle<'cleanup'>;
export type PreparedAccess = Handle<'access'>;
export type QueryPlan = Handle<'query-plan'>;
export type QueryWorkspace = Handle<'query-workspace'>;
export type SpawnPlan = Handle<'spawn-plan'>;
