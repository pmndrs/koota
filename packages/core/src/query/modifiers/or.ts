import type { OrModifier, OrParameter } from '../types';
import { internModifier, type ModifierCache } from '../modifier';

const cache: ModifierCache = new WeakMap();

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> => {
  return internModifier(cache, 'or', 2, params) as unknown as OrModifier<T>;
};
