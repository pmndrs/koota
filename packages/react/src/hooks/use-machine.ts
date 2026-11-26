import {
  $internal,
  type Entity,
  type Machine,
  type MachineStates,
  type Trait,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

type MachineSnapshot = { state: Trait | undefined; revision: number };

function readMachine(world: World, entity: Entity, machine: Machine, previous?: MachineSnapshot) {
  const state = machine.current(world, entity);
  const revision = machine[$internal].machine!.revision(world, entity);
  return previous && previous.state === state && previous.revision === revision
    ? previous
    : { state, revision };
}

function attachMachine(
  world: World,
  entity: Entity,
  machine: Machine,
  push: (value: MachineSnapshot) => void
) {
  return world.onTransition(entity, machine, (_entity, _from, to) => {
    push({ state: to, revision: machine[$internal].machine!.revision(world, entity) });
  });
}

export function useMachine<S extends MachineStates>(
  target: Entity | World | undefined | null,
  machine: Machine<S>
): S[keyof S] | undefined {
  return useEntityValue(target, machine, readMachine, attachMachine)?.state as S[keyof S] | undefined;
}
