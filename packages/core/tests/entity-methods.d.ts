import type { EntityMethods } from '../src/entity/types';

// The suites here run on worlds from the entity methods entry, so entities carry the methods.
declare module '../src/entity/types' {
  // oxlint-disable-next-line typescript/no-empty-object-type
  interface EntityExtensions extends EntityMethods {}
}
