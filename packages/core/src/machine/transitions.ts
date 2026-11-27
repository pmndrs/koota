import { assertsEnabled } from '../build-flags';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { reconcileMachine } from '../query/reconciliation';
import { emit, notifyTraitAdded } from '../trait/hooks';
import { DESTROYED_WORD, EMPTY_MASK_PAGE } from '../trait/mask-table';
import { clearTraitMembership, hasTraitMembership, setTraitMembership } from '../trait/membership';
import { registerTrait } from '../trait/registry';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { WorldContext } from '../world/types';
import type { MachineContext } from './types';

/** The immediate transition. Inside a defer scope the log holds it until the scope ends. */
export function applyEnter(
  ctx: WorldContext,
  entity: Entity,
  machine: MachineContext,
  state: Trait | [Trait, unknown]
) {
  const target = Array.isArray(state) ? state[0] : state;
  changeMachine(ctx, entity, machine, target, Array.isArray(state) ? state[1] : undefined, true);
}

export function getCurrentState(
  ctx: WorldContext,
  entity: Entity,
  machine: MachineContext
): Trait | undefined {
  for (const member of machine.members) {
    if (hasTraitMembership(ctx, entity, member)) return member;
  }
}

/** A revision belongs to one entity so a callback may safely transition other entities. */
export function getMachineRevision(ctx: WorldContext, state: Trait, eid: number): number {
  return (
    ctx.traitInstances[state[$internal].machine!.trait.id]?.machine?.revisions[eid >>> 10]?.[
      eid & 1023
    ] ?? 0
  );
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
    if (selected === undefined && hasTraitMembership(ctx, entity, member)) return;
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

function changeMachine(
  ctx: WorldContext,
  entity: Entity,
  machine: MachineContext,
  to: Trait | undefined,
  value: unknown,
  reenter: boolean,
  dying = false
) {
  const from = getCurrentState(ctx, entity, machine);
  if (!reenter && from === to) return;
  if (
    from !== undefined &&
    to !== undefined &&
    machine.transitions !== undefined &&
    !machine.transitions.get(from)?.has(to)
  ) {
    if (assertsEnabled) {
      throw new Error('Koota: [MACHINE_ILLEGAL_TRANSITION] The transition is not in the table.');
    }
    return;
  }
  // Every caller holds a defer scope, so transitions and destroys made by the callbacks below
  // wait until this one completes.
  let marker = ctx.traitInstances[machine.trait.id];
  const subscriptionVersion = marker?.machine?.subscriptionVersion ?? 0;
  if (marker === undefined) marker = registerTrait(ctx, machine.trait);
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
    for (const generation of ctx.generations) {
      const page = ctx.entityMasks[generation][eid >>> 10];
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
  if (after) notifyTraitAdded(entity, after);
  if (from === undefined) notifyTraitAdded(entity, marker);
  // Registration numbers exclude late listeners without copying the subscriber lists.
  for (const callback of data.subscribers.keys()) {
    if (data.subscribers.get(callback)! <= subscriptionVersion) callback(entity, from, to, previous);
  }
  const subscribers = data.byEntity.get(entity);
  if (subscribers)
    for (const callback of subscribers.keys()) {
      if (subscribers.get(callback)! <= subscriptionVersion) callback(entity, from, to, previous);
    }
}
