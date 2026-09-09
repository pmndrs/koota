import { rethrowPublicError } from '../errors';
import {
  $internal,
  clearBuffer,
  createBufferState,
  recordAdd,
  recordChanged,
  recordDestroy,
  recordRemove,
  recordSet,
  recordSpawn,
  type CommandBufferState,
  type KernelContext,
} from '../../kernel';
import type { Entity } from '../entity/types';
import type { RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitValue,
} from '../trait/types';

/** A reusable, world-bound buffer. Recording does not register traits or invoke hooks. */
export interface CommandBuffer {
  /** @internal */
  readonly [$internal]: CommandBufferState;
  readonly size: number;
  spawn(...traits: ConfigurableTrait[]): Entity;
  destroy(entity: Entity): void;
  add(...traits: ConfigurableTrait[]): void;
  add(entity: Entity, ...traits: ConfigurableTrait[]): void;
  remove(...traits: (Trait | RelationPair)[]): void;
  remove(entity: Entity, ...traits: (Trait | RelationPair)[]): void;
  set<T extends Trait | RelationPair>(
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    triggerChanged?: boolean
  ): void;
  set<T extends Trait | RelationPair>(
    entity: Entity,
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    triggerChanged?: boolean
  ): void;
  changed(entity: Entity, trait: Trait, target?: Entity): void;
  /** Discard pending work and invalidate handles reserved by its spawn commands. */
  clear(): void;
}

export function createCommandBuffer(context: KernelContext, worldEntity: Entity): CommandBuffer {
  const state = createBufferState(context);
  return {
    [$internal]: state,
    get size() {
      return state.words.length / 5;
    },
    spawn(...traits: ConfigurableTrait[]) {
      try {
        return recordSpawn(state, ...traits) as Entity;
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    destroy(entity: Entity) {
      try {
        recordDestroy(state, entity);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    add(...inputs: (Entity | ConfigurableTrait)[]) {
      try {
        const hasEntity = typeof inputs[0] === 'number';
        const entity = hasEntity ? (inputs[0] as Entity) : worldEntity;
        for (let i = hasEntity ? 1 : 0; i < inputs.length; i++) {
          recordAdd(state, entity, inputs[i] as ConfigurableTrait);
        }
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    remove(...inputs: (Entity | Trait | RelationPair)[]) {
      try {
        const hasEntity = typeof inputs[0] === 'number';
        const entity = hasEntity ? (inputs[0] as Entity) : worldEntity;
        for (let i = hasEntity ? 1 : 0; i < inputs.length; i++) {
          recordRemove(state, entity, inputs[i] as Trait | RelationPair);
        }
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    set(first: Entity | Trait | RelationPair, second: any, third?: any, fourth = true) {
      try {
        const hasEntity = typeof first === 'number';
        recordSet(
          state,
          hasEntity ? first : worldEntity,
          hasEntity ? second : first,
          hasEntity ? third : second,
          hasEntity ? fourth : (third ?? true)
        );
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    changed(entity: Entity, trait: Trait, target?: Entity) {
      try {
        recordChanged(state, entity, trait, target);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    clear() {
      try {
        clearBuffer(state);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
  };
}
