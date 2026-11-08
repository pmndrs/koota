import type { Entity } from '../entity/types';
import type { TagTrait, Trait, TraitRecord, TraitTuple } from '../trait/types';
import type { $internal } from '../common';

export type MachineStates = Record<string, Trait>;

export type MachineStateInput<T extends Trait> =
  (T & { readonly [$internal]: { readonly required: false } }) | TraitTuple<T>;

export type TransitionSubscriber<T extends Trait = Trait> = (
  entity: Entity,
  from: T | undefined,
  to: T | undefined,
  previous: TraitRecord<T> | undefined
) => void;

export type Machine<S extends MachineStates = MachineStates> = TagTrait & {
  readonly states: Readonly<S>;
  current(entity: Entity): S[keyof S] | undefined;
  enter(entity: Entity, state: MachineStateInput<S[keyof S]>): void;
};

export type MachineOptions<S extends MachineStates> = {
  states: S;
  initial: S[keyof S] & { readonly [$internal]: { readonly required: false } };
  transitions?: Partial<{ [K in keyof S]: readonly S[keyof S][] }>;
};

export type MachineContext = {
  trait: TagTrait;
  members: readonly Trait[];
  initial: Trait;
  transitions: Map<Trait, ReadonlySet<Trait>> | undefined;
  initializers: Map<Trait, (value: unknown) => unknown>;
  revision(entity: Entity): number;
};

export type MachineInstance = {
  subscribers: Map<TransitionSubscriber, number>;
  byEntity: Map<Entity, Map<TransitionSubscriber, number>>;
  subscriptionVersion: number;
  revisions: number[][];
};
