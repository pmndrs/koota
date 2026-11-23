import {
  $internal as internal,
  type Entity,
  type Machine,
  type MachineStates,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useMachine<S extends MachineStates>(
  target: () => Entity | World | undefined | null,
  machine: MaybeGetter<Machine<S>>
): { readonly current: S[keyof S] | undefined } {
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<S[keyof S] | undefined>(
    initialEntity === undefined ? undefined : resolve(machine).current(initialEntity)
  );
  // Self-transitions replace data while keeping the same member trait.
  let version = $state(0);

  $effect(() => {
    const observedTarget = target();
    const resolvedMachine = resolve(machine);
    return observeTarget(observedTarget, (entity) => {
      if (entity === undefined) {
        value = undefined;
        return;
      }

      const update = () => {
        value = entity.isAlive() ? resolvedMachine.current(entity) : undefined;
        untrack(() => version++);
      };
      const observer = entity[internal].observeSettled(update);
      const unsubscribe = entity.onTransition(resolvedMachine, observer.invalidate);
      update();
      return () => {
        observer.unsubscribe();
        unsubscribe();
      };
    });
  });

  return {
    get current() {
      void version;
      return value;
    },
  };
}
