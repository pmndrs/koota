import { addTrait, createEntity, initializeKernel } from '../../kernel';
import type { Entity } from '../entity/types';
import { IsExcluded } from '../query/query';
import type { ConfigurableTrait } from '../trait/types';
import type { WorldContext } from './types';

export function initializeWorld(state: WorldContext, traits?: ConfigurableTrait[]): void {
  const ctx = state.kernel;
  if (ctx.isRegistered) return;
  initializeKernel(ctx);
  state.worldEntity = createEntity(ctx, IsExcluded) as Entity;
  if (traits) addTrait(ctx, state.worldEntity, ...traits);
}
