import type { Entity } from '../entity/types';
import type { WorldContext } from '../world/types';

/** Applies one structural change. The log stores it with its entity and two arguments. */
export type Command = (ctx: WorldContext, entity: Entity, a: any, b: any) => void;

/** Shared by subscriptions using one wrapper in one world. */
export type SettledCallback = {
  update: () => void;
  version: number;
  pending: number;
  /** The round that owns the queue entry, or -1 when idle. */
  round: number;
};
