import { releaseReservation, reserveEntity } from '../../kernel';
import type { Entity } from '../entity/types';
import { createInternalError, rethrowPublicError } from '../errors';
import { allocateHandle, handleIndex, releaseHandle, toLocal } from '../handles';
import { isRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { $internal } from '../symbols';
import type { ConfigurableTrait, ExtractSchema, SetTraitCallback, Trait, TraitValue } from '../trait/types';
import { CommandKind, type Command, type WorldState } from '../world/state';

export type CommandBufferState = {
  readonly state: WorldState;
  readonly epoch: number;
  readonly commands: Command[];
  playing: boolean;
};

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

/** SoA records are copied when recorded. Instances and nested objects stay references. */
export function captureValue(trait: Trait, value: unknown): unknown {
  return trait[$internal].type === 'soa' && value !== undefined && value !== null && typeof value !== 'function'
    ? { ...(value as object) }
    : value;
}

export function captureTrait(config: ConfigurableTrait): ConfigurableTrait {
  if (Array.isArray(config)) return [config[0], captureValue(config[0], config[1])] as ConfigurableTrait;
  if (isRelationPair(config)) return { ...config, params: config.params ? { ...config.params } : undefined } as RelationPair;
  return config;
}

function assertWritable(buffer: CommandBufferState): void {
  if (buffer.epoch !== buffer.state.epoch) throw createInternalError('BUFFER_CONTEXT_EXPIRED');
  if (buffer.playing) throw createInternalError('BUFFER_RECORD_DURING_PLAYBACK');
}

export function clearCommands(buffer: CommandBufferState): void {
  if (buffer.playing) throw createInternalError('BUFFER_CLEAR_DURING_PLAYBACK');
  if (buffer.epoch === buffer.state.epoch) {
    const state = buffer.state;
    for (let i = 0; i < buffer.commands.length; i++) {
      const command = buffer.commands[i];
      if (command.kind !== CommandKind.Spawn) continue;
      if (state.kernel !== null) {
        const local = toLocal(state, command.entity);
        if (local !== 0) releaseReservation(state.kernel, local);
      }
      releaseHandle(state, command.entity);
    }
  }
  buffer.commands.length = 0;
}

export function createCommandBuffer(state: WorldState, worldEntity: Entity): CommandBuffer {
  const buffer: CommandBufferState = { state, epoch: state.epoch, commands: [], playing: false };
  const record = (kind: number, entity: Entity, operand?: unknown, value?: unknown, flag = true) => {
    assertWritable(buffer);
    buffer.commands.push({ kind, entity, operand, value, flag });
  };
  return {
    [$internal]: buffer,
    get size() {
      return buffer.commands.length;
    },
    spawn(...traits: ConfigurableTrait[]) {
      try {
        assertWritable(buffer);
        const entity = allocateHandle(state, reserveEntity(state.kernel!));
        state.reserved.add(handleIndex(entity));
        record(CommandKind.Spawn, entity, traits.map(captureTrait));
        return entity;
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    destroy(entity: Entity) {
      try {
        record(CommandKind.Destroy, entity);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    add(...inputs: (Entity | ConfigurableTrait)[]) {
      try {
        const hasEntity = typeof inputs[0] === 'number';
        const entity = hasEntity ? (inputs[0] as Entity) : worldEntity;
        for (let i = hasEntity ? 1 : 0; i < inputs.length; i++) {
          record(CommandKind.Add, entity, captureTrait(inputs[i] as ConfigurableTrait));
        }
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    remove(...inputs: (Entity | Trait | RelationPair)[]) {
      try {
        const hasEntity = typeof inputs[0] === 'number';
        const entity = hasEntity ? (inputs[0] as Entity) : worldEntity;
        for (let i = hasEntity ? 1 : 0; i < inputs.length; i++) record(CommandKind.Remove, entity, inputs[i]);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    set(first: Entity | Trait | RelationPair, second: unknown, third?: unknown, fourth?: unknown) {
      try {
        const hasEntity = typeof first === 'number';
        const target = (hasEntity ? second : first) as Trait | RelationPair;
        const value = hasEntity ? third : second;
        const flag: boolean = hasEntity ? ((fourth as boolean | undefined) ?? true) : ((third as boolean | undefined) ?? true);
        const resolved = isRelationPair(target) ? target.relation[$internal].trait : target;
        record(CommandKind.Set, hasEntity ? (first as Entity) : worldEntity, target, captureValue(resolved, value), flag);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    changed(entity: Entity, trait: Trait, target?: Entity) {
      try {
        record(CommandKind.Changed, entity, trait, target);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
    clear() {
      try {
        clearCommands(buffer);
      } catch (error) {
        rethrowPublicError(error);
      }
    },
  };
}
