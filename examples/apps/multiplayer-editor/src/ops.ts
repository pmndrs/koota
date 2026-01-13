/**
 * Re-export from shared for backwards compatibility.
 * New code should import directly from './shared/protocol' and './shared/ops'.
 */
export * from './shared/protocol';
export * from './shared/ops';
export { createNetIdMap, type NetIdMap } from './shared/net-id-map';
