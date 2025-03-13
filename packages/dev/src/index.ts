// TODO: Or, export selectively from ../../src/index ?
export { createWorld } from '../../core/src/world/world';
export { trait } from '../../core/src/trait/trait';
export { createAdded } from '../../core/src/query/modifiers/added';
export { createRemoved } from '../../core/src/query/modifiers/removed';
export { createChanged } from '../../core/src/query/modifiers/changed';
export { Not } from '../../core/src/query/modifiers/not';
export { Or } from '../../core/src/query/modifiers/or';
export { universe } from '../../core/src/universe/universe';
export { cacheQuery } from '../../core/src/query/utils/cache-query';
export { relation, Pair, Wildcard } from '../../core/src/relation/relation';
export { $internal } from '../../core/src/common';
export { createActions } from '../../core/src/actions/create-actions';

// Export types
export * from '../../core/src/trait/types';
export * from '../../core/src/entity/types';
export * from '../../core/src/query/types';
export * from '../../core/src/relation/types';
export type { World } from '../../core/src/world/world';
