import { handleGeneration, handleIndex, registry, resetRegistry } from './handles';

/** Diagnostic view of the global handle registry. Not an interface for adapters. */
export const universe = {
  /** Registered world states by world id. Undefined until a world's first mutation, and after destruction. */
  get worlds() {
    return registry.worlds;
  },
  /** Page owners by page id. Null when the page is free. */
  get pageOwners() {
    return registry.owners;
  },
  get freePages() {
    return registry.freePages;
  },
  reset: resetRegistry,
};

export function unpackEntity(entity: number): { generation: number; entityId: number } {
  return { generation: handleGeneration(entity), entityId: handleIndex(entity) };
}
