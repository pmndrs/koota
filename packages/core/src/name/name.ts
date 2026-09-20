import { $internal } from '../common';
import { createTraitContext, defineTraitProperties, hasTrait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { WorldContext } from '../world';
import {
  claimName,
  refreshNamedQueries,
  releaseName,
  validateName,
  type NameStore,
} from './name-index';
import { $name } from './symbols';
import type { NameConfig, NameTrait } from './types';

const schema = { value: '' };

/** Keep the column, lookup index and query membership current through every write path. */
function writeName(
  ctx: WorldContext,
  eid: number,
  store: NameStore,
  value: { value?: string }
): boolean {
  if (value.value === undefined || store.value[eid >>> 10]?.[eid & 1023] === value.value)
    return false;
  const entity = ctx.entityIndex.dense[ctx.entityIndex.sparse[eid]];
  // A query callback may have removed Name before its snapshot is written back.
  if (!hasTrait(ctx, entity, Name)) return false;
  if (!claimName(ctx, store, eid, value.value)) return false;
  refreshNamedQueries(ctx, entity, getTraitInstance(ctx.traitInstances, Name)!);
  return true;
}

const context = createTraitContext(schema, () => ({
  add: (ctx, eid, store, value?: { value?: string }) => {
    claimName(ctx, store as NameStore, eid, value?.value);
  },
  set: writeName,
  remove: releaseName,
}));

/** Built-in trait whose configs carry a name directly, without a global registry. */
export const Name = Object.assign(
  (value: string): NameConfig => {
    validateName(value);
    return [Name, { value }];
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
