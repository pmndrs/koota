import { getFirstTarget, getSources, getTargets, setSources } from '../../kernel';
import { handleGeneration, handleIndex, isHandleAlive, locate, locatedLocal, toLocal, toPublic } from '../handles';
import type { Relation, RelationPair } from '../relation/types';
import { $internal } from '../symbols';
import type { ConfigurableTrait, Trait } from '../trait/types';
import {
  addToEntity,
  changedOnEntity,
  destroyPublicEntity,
  entityHas,
  readTrait,
  registerTrait,
  removeFromEntity,
  setOnEntity,
} from '../world/lifecycle';
import type { WorldState } from '../world/state';
import { resolveHookTrait, subscribeTrait, type HookInput } from '../world/subscriptions';
import type { Entity } from './types';

function subscribe(
  entity: Entity,
  event: 'add' | 'remove' | 'change',
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
): () => void {
  const state = locate(entity) as WorldState | undefined;
  if (!state || locatedLocal === 0) return () => {};
  registerTrait(state, resolveHookTrait(input));
  return subscribeTrait(state, input, event, callback, entity);
}

// @ts-expect-error
Number.prototype.add = function (this: Entity, ...traits: ConfigurableTrait[]) {
  const state = locate(this) as WorldState | undefined;
  if (state) addToEntity(state, this, traits);
};

// @ts-expect-error
Number.prototype.remove = function (this: Entity, ...traits: (Trait | RelationPair)[]) {
  const state = locate(this) as WorldState | undefined;
  if (state) removeFromEntity(state, this, traits);
};

// @ts-expect-error
Number.prototype.has = function (this: Entity, trait: Trait | RelationPair) {
  const state = locate(this) as WorldState | undefined;
  return state !== undefined && locatedLocal !== 0 && entityHas(state, this, trait, locatedLocal);
};

// @ts-expect-error
Number.prototype.destroy = function (this: Entity) {
  const state = locate(this) as WorldState | undefined;
  if (state) destroyPublicEntity(state, this);
};

// @ts-expect-error
Number.prototype.changed = function (this: Entity, trait: Trait) {
  const state = locate(this) as WorldState | undefined;
  if (state) changedOnEntity(state, this, trait);
};

// @ts-expect-error
Number.prototype.get = function (this: Entity, trait: Trait | RelationPair) {
  const state = locate(this) as WorldState | undefined;
  return state !== undefined && locatedLocal !== 0 ? readTrait(state, this, trait, locatedLocal) : undefined;
};

// @ts-expect-error
Number.prototype.set = function (this: Entity, trait: Trait | RelationPair, value: unknown, triggerChanged = true) {
  const state = locate(this) as WorldState | undefined;
  if (state) setOnEntity(state, this, trait, value, triggerChanged, locatedLocal);
};

// @ts-expect-error
Number.prototype.onAdd = function (this: Entity, input: HookInput, callback: (entity: Entity, target?: Entity) => void) {
  return subscribe(this, 'add', input, callback);
};

// @ts-expect-error
Number.prototype.onRemove = function (this: Entity, input: HookInput, callback: (entity: Entity, target?: Entity) => void) {
  return subscribe(this, 'remove', input, callback);
};

// @ts-expect-error
Number.prototype.onChange = function (this: Entity, input: HookInput, callback: (entity: Entity, target?: Entity) => void) {
  return subscribe(this, 'change', input, callback);
};

// @ts-expect-error
Number.prototype.targetsFor = function (this: Entity, relation: Relation<Trait>) {
  const state = locate(this) as WorldState | undefined;
  if (!state || locatedLocal === 0) return [];
  const targets = getTargets(state.kernel!, locatedLocal, relation[$internal].id);
  const result: Entity[] = [];
  for (let i = 0; i < targets.length; i++) result.push(toPublic(state, targets[i]));
  return result;
};

// @ts-expect-error
Number.prototype.sourcesFor = function (this: Entity, relation: Relation<Trait>) {
  const state = locate(this) as WorldState | undefined;
  if (!state || locatedLocal === 0) return [];
  const sources = getSources(state.kernel!, relation[$internal].id, locatedLocal);
  const result: Entity[] = [];
  for (let i = 0; i < sources.length; i++) result.push(toPublic(state, sources[i]));
  return result;
};

// @ts-expect-error
Number.prototype.orderSources = function (this: Entity, relation: Relation<Trait>, sources: readonly Entity[]) {
  const state = locate(this) as WorldState | undefined;
  if (!state || locatedLocal === 0) throw new Error('Koota: Cannot order the sources of a dead entity.');
  const parent = locatedLocal;
  const locals: number[] = [];
  for (let i = 0; i < sources.length; i++) locals.push(toLocal(state, sources[i]));
  if (!setSources(state.kernel!, relation[$internal].id, parent, locals)) {
    throw new Error('Koota: orderSources needs an ordered relation and every current source exactly once.');
  }
};

// @ts-expect-error
Number.prototype.targetFor = function (this: Entity, relation: Relation<Trait>) {
  const state = locate(this) as WorldState | undefined;
  if (!state || locatedLocal === 0) return undefined;
  const target = getFirstTarget(state.kernel!, locatedLocal, relation[$internal].id);
  return target === undefined ? undefined : toPublic(state, target);
};

// @ts-expect-error
Number.prototype.id = function (this: Entity) {
  return handleIndex(this);
};

// @ts-expect-error
Number.prototype.generation = function (this: Entity) {
  return handleGeneration(this);
};

// @ts-expect-error
Number.prototype.isAlive = function (this: Entity) {
  return isHandleAlive(this);
};
