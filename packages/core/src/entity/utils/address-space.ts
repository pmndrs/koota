import { createPageAllocator } from './page-allocator';

/**
 * The one structure worlds share. An entity is a number, so the page that holds its id is how
 * its methods find the world that owns it. Nothing else lives here. Each world keeps its own
 * state and the program's definitions carry their own ids.
 */
export const addressSpace = createPageAllocator();
