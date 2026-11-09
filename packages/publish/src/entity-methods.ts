import type { EntityMethods } from '../../core/src/index';

export * from '../../core/src/entity-methods';

// Every entity in a program that imports this entry carries the methods in its type, as it does
// at runtime once the first world is created here.
declare module 'koota' {
  // oxlint-disable-next-line typescript/no-empty-object-type
  interface EntityExtensions extends EntityMethods {}
}
