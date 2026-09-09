import { createKernelError } from '../errors';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { reserveEntity } from '../entity/entity-index';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/is-relation';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { reserveBuffer, CommandKind, type CommandBufferState } from './buffer-state';

export function recordSpawn(buffer: CommandBufferState, ...traits: ConfigurableTrait[]): Entity {
  assertWritable(buffer);
  const entity = reserveEntity(buffer.context.entityIndex);
  record(buffer, CommandKind.Spawn, entity, traits.map(captureTrait));
  return entity;
}

export function recordDestroy(buffer: CommandBufferState, entity: Entity): void {
  record(buffer, CommandKind.Destroy, entity);
}

export function recordAdd(
  buffer: CommandBufferState,
  entity: Entity,
  ...traits: ConfigurableTrait[]
): void {
  for (const trait of traits) record(buffer, CommandKind.Add, entity, captureTrait(trait));
}

export function recordRemove(
  buffer: CommandBufferState,
  entity: Entity,
  ...traits: (Trait | RelationPair)[]
): void {
  for (const trait of traits) record(buffer, CommandKind.Remove, entity, trait);
}

export function recordSet(
  buffer: CommandBufferState,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged = true
): void {
  const resolved = isRelationPair(trait) ? trait.relation[$internal].trait : trait;
  record(
    buffer,
    CommandKind.Set,
    entity,
    trait,
    captureValue(resolved, value),
    Number(triggerChanged)
  );
}

export function recordChanged(
  buffer: CommandBufferState,
  entity: Entity,
  trait: Trait,
  target?: Entity
): void {
  record(buffer, CommandKind.Changed, entity, trait, target);
}

/** Numeric operations retain the predicate generation until playback. */
export function recordIdentity(
  buffer: CommandBufferState,
  kind: number,
  entity: Entity,
  predicate: Entity,
  descriptor: Trait | RelationPair,
  value?: any
): void {
  const trait = isRelationPair(descriptor) ? descriptor.relation[$internal].trait : descriptor;
  record(buffer, kind, entity, descriptor, captureValue(trait, value), predicate);
}

function assertWritable(buffer: CommandBufferState): void {
  if (buffer.epoch !== buffer.context.commandEpoch) throw createKernelError('BUFFER_CONTEXT_EXPIRED');
  if (buffer.playing) throw createKernelError('BUFFER_RECORD_DURING_PLAYBACK');
}

function record(
  buffer: CommandBufferState,
  kind: number,
  entity: Entity,
  operand?: any,
  value?: any,
  flags = 0
): void {
  assertWritable(buffer);
  if (buffer.count === buffer.capacity) reserveBuffer(buffer, Math.max(64, buffer.capacity * 2));
  const offset = buffer.count * 2;
  const word = buffer.count++ * 5;
  buffer.payloads[offset] = operand;
  buffer.payloads[offset + 1] = value;
  buffer.words[word] = kind;
  buffer.words[word + 1] = entity;
  buffer.words[word + 2] = offset;
  buffer.words[word + 3] = offset + 1;
  buffer.words[word + 4] = flags;
}

function captureValue(trait: Trait, value: any): any {
  return trait[$internal].type === 'soa' && value !== undefined && typeof value !== 'function'
    ? { ...value }
    : value;
}

function captureTrait(config: ConfigurableTrait): ConfigurableTrait {
  if (Array.isArray(config)) return [config[0], captureValue(config[0], config[1])];
  if (isRelationPair(config))
    return { ...config, params: config.params ? { ...config.params } : undefined } as RelationPair;
  return config;
}
