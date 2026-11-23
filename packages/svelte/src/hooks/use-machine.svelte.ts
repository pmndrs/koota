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
import { useWorld } from '../world/world-context.js';

export function useMachine<S extends MachineStates>(
  target: () => Entity | World | undefined | null,
  machine: MaybeGetter<Machine<S>>
): { readonly current: S[keyof S] | undefined } {
  useWorld();
  const binding = $derived.by(() => {
    const subject = target();
    const selected = resolve(machine);
    const entity = getTargetEntity(subject);
    return { subject, selected, value: entity === undefined ? undefined : selected.current(entity) };
  });
  // Self-transitions replace data while keeping the same member trait.
  let version = $state(0);

  $effect(() => {
    const current = binding;
    return observeTarget(current.subject, (entity) => {
      const update = () => {
        current.value = entity?.isAlive() ? current.selected.current(entity) : undefined;
        untrack(() => version++);
      };
      update();
      if (entity === undefined) return;
      const observer = entity[internal].observeSettled(update);
      const unsubscribe = entity.onTransition(current.selected, observer.invalidate);
      return () => {
        observer.unsubscribe();
        unsubscribe();
      };
    });
  });

  return {
    get current() {
      void version;
      return binding.value;
    },
  };
}
