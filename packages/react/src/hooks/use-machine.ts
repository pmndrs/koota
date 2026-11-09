import { $internal, type Entity, type Machine, type MachineStates, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

function readMachine(world: World, entity: Entity, machine: Machine) {
  return {
    state: machine.current(world, entity),
    revision: machine[$internal].machine!.revision(world, entity),
  };
}

function attachMachine(
  world: World,
  entity: Entity,
  machine: Machine,
  push: (value: ReturnType<typeof readMachine>) => void
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
