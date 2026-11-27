import { assertsEnabled } from '../build-flags';
import { runCommand } from '../command/buffer';
import { assertEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import { getEntityContext } from '../entity/page-allocator';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { isOrderedTrait } from '../relation/ordered';
import { createInitializer } from '../storage/accessors';
import { trait } from '../trait/trait';
import type { Trait, TraitInstance } from '../trait/types';
import type { World, WorldContext } from '../world/types';
import { applyEnter, getCurrentState, getMachineRevision } from './transitions';
import type { Machine, MachineContext, MachineOptions, MachineStates } from './types';

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
    revision(world, entity) {
      return getMachineRevision(world[$internal], marker, getEntityId(entity));
    },
  };
  const result = Object.assign(marker, {
    states,
    // Both calls take the world first, or the entity alone when its world has entity methods.
    current(first: World | Entity, second?: Entity) {
      const alone = typeof first === 'number';
      const ctx = alone ? getEntityContext(first) : first[$internal];
      const entity = alone ? first : second!;
      if (assertsEnabled) assertEntityAlive(ctx, entity);
      return getCurrentState(ctx, entity, context);
    },
    enter(
      first: World | Entity,
      second: Entity | Trait | [Trait, unknown],
      third?: Trait | [Trait, unknown]
    ) {
      const alone = typeof first === 'number';
      const ctx = alone ? getEntityContext(first) : first[$internal];
      const entity = (alone ? first : second) as Entity;
      const state = (alone ? second : third) as Trait | [Trait, unknown];
      if (assertsEnabled) assertEntityAlive(ctx, entity);
      const target = Array.isArray(state) ? state[0] : state;
      if (!members.includes(target))
        throw new Error('Koota: [MACHINE_STATE] The state is not a member.');
      runCommand(ctx, applyEnter, entity, context, state);
    },
  }) as Machine<S>;
  marker[$internal].onRegister = registerMachine;
  marker[$internal].machine = context;
  marker[$internal].kind = 'machine';
  for (const member of members) {
    member[$internal].machine = context;
    member[$internal].kind = 'machine';
  }
  return result;
}

function registerMachine(_ctx: WorldContext, instance: TraitInstance) {
  instance.machine = {
    subscribers: new Map(),
    byEntity: new Map(),
    subscriptionVersion: 0,
    revisions: [],
  };
}
