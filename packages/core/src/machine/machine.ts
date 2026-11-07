import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import { getEntityContext, isEntityDestroying } from '../entity/entity';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { DESTROYED_WORD, EMPTY_MASK_PAGE } from '../entity/utils/paged-mask';
import {
  addEntityToQuery,
  flushQueryBatch,
  reconcileAnchoredQueries,
  removeEntityFromQuery,
} from '../query/query';
import type { QueryInstance } from '../query/types';
import { checkQuery } from '../query/utils/check-query';
import { checkQueryWithFilters } from '../query/utils/check-query-filters';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import { clearPendingChanges } from '../query/utils/mark-tracked-trait-changed';
import { notifyTraitAdded } from '../query/modifiers/changed';
import { isOrderedTrait } from '../relation/ordered';
import { createInitializer } from '../storage/accessors';
import { emit } from '../trait/subscriptions';
import { clearTraitMembership, setTraitMembership } from '../trait/membership';
import { hasTrait, registerTrait, trait } from '../trait/trait';
import type { ConfigurableTrait, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { endStructuralChanges } from '../world/settled';
import type {
  Machine,
  MachineContext,
  MachineInstance,
  MachineOptions,
  MachineStates,
  TransitionSubscriber,
} from './types';

export function machine<const S extends MachineStates>(options: MachineOptions<S>): Machine<S> {
  const states = Object.freeze({ ...options.states });
  const members = Object.values(states);
  if (members.length === 0 || new Set(members).size !== members.length) {
    throw new Error('Koota: [MACHINE_STATES] States must be nonempty and distinct.');
  }
  for (const member of members) {
    const context = member[$internal];
    if (context.machine)
      throw new Error('Koota: [MACHINE_MEMBER_TAKEN] A trait belongs to one machine.');
    if (context.registered)
      throw new Error(
        'Koota: [MACHINE_REGISTERED] Declare machines before registering their states.'
      );
    if (context.kind !== 'trait' || isOrderedTrait(member)) {
      throw new Error('Koota: [MACHINE_STATES] States must be ordinary traits.');
    }
  }
  if (!members.includes(options.initial) || options.initial[$internal].required) {
    throw new Error('Koota: [MACHINE_INITIAL] The initial state must be a member with defaults.');
  }
  let transitions: MachineContext['transitions'];
  if (options.transitions !== undefined) {
    transitions = new Map();
    for (const key of Object.keys(options.transitions)) {
      const targets = options.transitions[key]!;
      if (!Object.hasOwn(states, key) || targets.some((target) => !members.includes(target))) {
        throw new Error(
          'Koota: [MACHINE_TRANSITIONS] Transition sources and targets must be members.'
        );
      }
      transitions.set(states[key], new Set(targets));
    }
  }
  const marker = trait();
  const context: MachineContext = {
    trait: marker,
    members,
    initial: options.initial,
    transitions,
    initializers: new Map(members.map((member) => [member, createInitializer(member.schema)])),
    revision(entity) {
      return machineRevision(getEntityContext(entity), marker, getEntityId(entity));
    },
  };
  const result = Object.assign(marker, {
    states,
    of(entity: Entity) {
      const ctx = getEntityContext(entity);
      if (assertsEnabled) assertEntityAlive(ctx, entity);
      return currentState(ctx, entity, context);
    },
    enter(entity: Entity, state: Trait | [Trait, unknown]) {
      const ctx = getEntityContext(entity);
      if (assertsEnabled) assertEntityAlive(ctx, entity);
      const target = Array.isArray(state) ? state[0] : state;
      if (!members.includes(target))
        throw new Error('Koota: [MACHINE_STATE] The state is not a member.');
      changeMachine(ctx, entity, context, target, Array.isArray(state) ? state[1] : undefined, true);
    },
  }) as Machine<S>;
  marker[$internal].machine = context;
  marker[$internal].kind = 'machine';
  for (const member of members) {
    member[$internal].machine = context;
    member[$internal].kind = 'machine';
  }
  return result;
}

export function createMachineInstance(): MachineInstance {
  return { subscribers: new Map(), byEntity: new Map(), subscriptionVersion: 0, revisions: [] };
}

function machineInstance(ctx: WorldContext, machine: MachineContext): TraitInstance {
  if (ctx.traitInstances[machine.trait.id] === undefined) registerTrait(ctx, machine.trait);
  return ctx.traitInstances[machine.trait.id]!;
}

function currentState(ctx: WorldContext, entity: Entity, machine: MachineContext): Trait | undefined {
  for (const member of machine.members) {
    if (hasTrait(ctx, entity, member)) return member;
  }
}

/** A revision belongs to one entity so a callback may safely transition other entities. */
export function machineRevision(ctx: WorldContext, state: Trait, eid: number): number {
  return (
    ctx.traitInstances[state[$internal].machine!.trait.id]?.machine?.revisions[eid >>> 10]?.[
      eid & 1023
    ] ?? 0
  );
}

export function subscribeMachine(
  ctx: WorldContext,
  machine: Machine,
  callback: TransitionSubscriber,
  entity?: Entity
): () => void {
  const instance = machineInstance(ctx, machine[$internal].machine!);
  const data = instance.machine!;
  let subscriptions = data.subscribers;
  if (entity !== undefined) {
    if (assertsEnabled) assertEntityAlive(ctx, entity);
    subscriptions = data.byEntity.get(entity)!;
    if (subscriptions === undefined) data.byEntity.set(entity, (subscriptions = new Map()));
    ctx.entitySubscribedInstances.add(instance);
  }
  const version = subscriptions.get(callback) ?? ++data.subscriptionVersion;
  subscriptions.set(callback, version);
  return () => {
    if (subscriptions.get(callback) !== version) return;
    subscriptions.delete(callback);
    if (
      entity !== undefined &&
      subscriptions.size === 0 &&
      data.byEntity.get(entity) === subscriptions
    )
      data.byEntity.delete(entity);
  };
}

/** Explicit members override a bare machine in the same argument list. */
export function addMachineTrait(
  ctx: WorldContext,
  entity: Entity,
  member: Trait,
  params: unknown,
  configs: ConfigurableTrait[]
) {
  const machine = member[$internal].machine!;
  let selected: Trait | undefined;
  let value: unknown;
  for (const config of configs) {
    const candidate = Array.isArray(config) ? config[0] : config;
    if (
      typeof candidate !== 'function' ||
      candidate[$internal].machine !== machine ||
      candidate === machine.trait
    )
      continue;
    if (selected !== undefined && selected !== candidate) {
      throw new Error('Koota: [MACHINE_MULTIPLE_STATES] Add one state per machine.');
    }
    if (selected === undefined) {
      selected = candidate;
      value = Array.isArray(config) ? config[1] : undefined;
    }
  }
  if (member === machine.trait) {
    if (selected === undefined && hasTrait(ctx, entity, member)) return;
    member = selected ?? machine.initial;
    params = value;
  }
  changeMachine(ctx, entity, machine, member, params, false);
}

export function removeMachineTrait(ctx: WorldContext, entity: Entity, member: Trait, dying = false) {
  const machine = member[$internal].machine!;
  if (!dying && member !== machine.trait) {
    throw new Error('Koota: [MACHINE_STATE_REQUIRED] Enter another state or remove the machine.');
  }
  changeMachine(ctx, entity, machine, undefined, undefined, false, dying);
}

export function assertMachineIdle(ctx: WorldContext, entity: Entity) {
  if (ctx.machineMutations?.has(entity)) {
    throw new Error(
      "Koota: [MACHINE_REENTRANT] Finish this entity's machine callbacks before changing its machine or destroying it."
    );
  }
}

/** Record both events before matching a tracking query against the final membership. */
function reconcileMachine(
  ctx: WorldContext,
  entity: Entity,
  before: TraitInstance | undefined,
  after: TraitInstance | undefined,
  marker: TraitInstance | undefined,
  dying: boolean
) {
  let queries: Set<QueryInstance> | undefined;
  let tracked: Set<QueryInstance> | undefined;
  let anchored = false;
  for (let i = 0; i < 3; i++) {
    const instance = i === 0 ? before : i === 1 ? after : marker;
    if (instance === undefined) continue;
    for (const query of instance.queries) (queries ??= new Set()).add(query);
    for (const query of instance.trackingQueries) (tracked ??= new Set()).add(query);
    anchored ||= instance.anchorRelations.length !== 0;
  }
  if (ctx.defersChanges) clearPendingChanges(ctx, getEntityId(entity));
  if (queries === undefined && tracked === undefined && !anchored) return;
  const outerBatch = ctx.queryBatch;
  ctx.queryBatch = [];
  try {
    if (queries)
      for (const query of queries) {
        if (
          !dying &&
          (query.filters === null
            ? checkQuery(ctx, query, entity)
            : checkQueryWithFilters(ctx, query, entity))
        )
          addEntityToQuery(query, entity);
        else removeEntityFromQuery(ctx, query, entity);
      }
    if (tracked)
      for (const query of tracked) {
        let matches = false;
        for (let i = 0; i < 3; i++) {
          const instance = i === 0 ? before : i === 1 ? after : marker;
          if (instance === undefined) continue;
          matches = checkQueryTracking(
            ctx,
            query,
            entity,
            i === 0 || after === undefined ? 'remove' : 'add',
            instance.generationId,
            instance.bitflag
          );
        }
        if (matches) addEntityToQuery(query, entity);
        else removeEntityFromQuery(ctx, query, entity);
      }
    if (anchored)
      for (let i = 0; i < 3; i++) {
        const instance = i === 0 ? before : i === 1 ? after : marker;
        if (instance !== undefined && instance.anchorRelations.length !== 0)
          reconcileAnchoredQueries(ctx, entity, instance, dying);
      }
    flushQueryBatch(ctx);
  } finally {
    ctx.queryBatch = outerBatch;
  }
}

function changeMachine(
  ctx: WorldContext,
  entity: Entity,
  machine: MachineContext,
  to: Trait | undefined,
  value: unknown,
  checked: boolean,
  dying = false
) {
  assertMachineIdle(ctx, entity);
  if (!dying && isEntityDestroying(entity))
    throw new Error('Koota: [MACHINE_DESTROYING] Cannot enter a state during destruction.');
  const from = currentState(ctx, entity, machine);
  if (!checked && from === to) return;
  if (
    assertsEnabled &&
    checked &&
    from !== undefined &&
    machine.transitions !== undefined &&
    !machine.transitions.get(from)?.has(to!)
  ) {
    throw new Error('Koota: [MACHINE_ILLEGAL_TRANSITION] The transition is not in the table.');
  }
  const mutations = (ctx.machineMutations ??= new Set());
  mutations.add(entity);
  ctx.structuralDepth++;
  try {
    let marker = ctx.traitInstances[machine.trait.id];
    const subscriptionVersion = marker?.machine?.subscriptionVersion ?? 0;
    if (marker === undefined) marker = machineInstance(ctx, machine);
    const data = marker.machine!;
    if (to !== undefined && ctx.traitInstances[to.id] === undefined) registerTrait(ctx, to);
    const before = from === undefined ? undefined : ctx.traitInstances[from.id]!;
    const after = to === undefined ? undefined : ctx.traitInstances[to.id]!;
    const eid = getEntityId(entity);
    const subscribed = data.subscribers.size !== 0 || data.byEntity.has(entity);
    const previous = subscribed && before ? from![$internal].get(ctx, eid, before.store) : undefined;
    let prepared: unknown;
    if (after) {
      if (from === to) prepared = machine.initializers.get(to!)!(value);
      else to![$internal].add(ctx, eid, after.store, value);
    }
    // Removal hooks see the old state. No membership or query changes have happened yet.
    if (before) emit(before.removeSubscriptions, entity);
    if (to === undefined) emit(marker.removeSubscriptions, entity);
    if (before) from![$internal].remove(ctx, eid, before.store);
    if (from === to && after) to![$internal].set(ctx, eid, after.store, prepared);
    if (dying) {
      for (const generation of ctx.entityMasks) {
        const page = generation[eid >>> 10];
        if (page !== EMPTY_MASK_PAGE)
          page[((eid & 1023) << 2) + DESTROYED_WORD] |= page[(eid & 1023) << 2];
      }
    }
    if (before) clearTraitMembership(ctx, entity, before);
    if (after) setTraitMembership(ctx, entity, after);
    if (from === undefined) setTraitMembership(ctx, entity, marker);
    if (to === undefined) clearTraitMembership(ctx, entity, marker);
    const revisions = (data.revisions[eid >>> 10] ??= []);
    revisions[eid & 1023] = (revisions[eid & 1023] ?? 0) + 1;
    reconcileMachine(
      ctx,
      entity,
      before,
      after,
      from === undefined || to === undefined ? marker : undefined,
      dying
    );
    if (after) {
      emit(after.addSubscriptions, entity);
      notifyTraitAdded(ctx, entity, after);
    }
    if (from === undefined) {
      emit(marker.addSubscriptions, entity);
      notifyTraitAdded(ctx, entity, marker);
    }
    // Registration numbers exclude late listeners without copying the subscriber lists.
    for (const callback of data.subscribers.keys()) {
      if (data.subscribers.get(callback)! <= subscriptionVersion)
        callback(entity, from, to, previous);
    }
    const subscribers = data.byEntity.get(entity);
    if (subscribers)
      for (const callback of subscribers.keys()) {
        if (subscribers.get(callback)! <= subscriptionVersion) callback(entity, from, to, previous);
      }
  } finally {
    mutations.delete(entity);
    endStructuralChanges(ctx);
  }
}
