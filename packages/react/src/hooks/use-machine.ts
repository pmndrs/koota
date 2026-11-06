import { $internal, type Entity, type Machine, type MachineStates, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

function readMachine(entity: Entity, machine: Machine) {
  return { state: machine.of(entity), revision: machine[$internal].machine!.revision(entity) };
}

function attachMachine(
  entity: Entity,
  machine: Machine,
  push: (value: ReturnType<typeof readMachine>) => void
) {
  return entity.onTransition(machine, (_entity, _from, to) => {
    push({ state: to, revision: machine[$internal].machine!.revision(entity) });
  });
}

export function useMachine<S extends MachineStates>(
  target: Entity | World | undefined | null,
  machine: Machine<S>
): S[keyof S] | undefined {
  return useEntityValue(target, machine, readMachine, attachMachine)?.state as S[keyof S] | undefined;
}
