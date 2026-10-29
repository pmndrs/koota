import type { Trait } from '../trait/types';
import { $name } from './symbols';

/** A name config carries the string used by spawn, add, has and query. */
export type NameConfig = [NameTrait, string];

/** The built-in trait for a unique, non-empty name within a world. */
export type NameTrait = Omit<Trait<() => string>, never> & {
  readonly [$name]: true;
  (value?: string): NameConfig;
};
