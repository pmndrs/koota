import type { Trait } from '../trait/types';
import { $name } from './symbols';

/** A name config carries the string used by spawn, add, has and query. */
export type NameConfig = [NameTrait, { value: string }];

/** The built-in trait for a unique, non-empty name within a world. */
export type NameTrait = Trait<{ value: string }> & {
  readonly [$name]: true;
  (value: string): NameConfig;
};
