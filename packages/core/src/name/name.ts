import { $internal } from '../common';
import { createTraitContext, defineTraitProperties } from '../trait/trait';
import { renameName, releaseName, validateName, validateNameAssignment } from './name-index';
import { $name } from './symbols';
import type { NameConfig, NameTrait } from './types';

const schema = () => '';

const context = createTraitContext(schema, (defaults) => ({
  validate: validateNameAssignment,
  add: (ctx, eid, store, value) => {
    defaults.add(ctx, eid, store, value);
    ctx.names.set(value!, ctx.entityIndex.dense[ctx.entityIndex.sparse[eid]]);
  },
  set: renameName,
  remove: releaseName,
}));

/** Built-in trait whose configs carry a name directly, without a global registry. */
export const Name = Object.assign(
  (value: string): NameConfig => {
    validateName(value);
    return [Name, value];
  },
  { [$internal]: context }
) as unknown as NameTrait;

defineTraitProperties(Name, context.id, schema);

Object.defineProperty(Name, $name, {
  value: true,
  writable: false,
  enumerable: false,
  configurable: false,
});
