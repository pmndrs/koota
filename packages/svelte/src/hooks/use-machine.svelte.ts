import {
  $internal as internal,
  type Entity,
  type Machine,
  type MachineStates,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { createTargetResolver } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useMachine<S extends MachineStates>(
  target: () => Entity | World | undefined | null,
  machine: MaybeGetter<Machine<S>>
): { readonly current: S[keyof S] | undefined } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state.raw<S[keyof S] | undefined>(
    initial === undefined ? undefined : resolve(machine).current(initial.world, initial.entity)
  );
  // Self-transitions replace data while keeping the same member trait.
  let version = $state(0);

  $effect(() => {
    const observedTarget = target();
    const resolvedMachine = resolve(machine);
    const listen = () => {
      const resolved = resolveTarget(observedTarget);
      if (resolved === undefined) {
        value = undefined;
        return;
      }
      const { world, entity } = resolved;
      const update = () => {
        value = world.isAlive(entity) ? resolvedMachine.current(world, entity) : undefined;
        untrack(() => version++);
      };
      const observer = world[internal].observeSettled(update);
      const unsubscribe = world.onTransition(entity, resolvedMachine, observer.invalidate);
      update();
      return () => {
        observer.unsubscribe();
        unsubscribe();
      };
    };
    let detach = listen();
    // Reset replaces the world entity even when the machine was absent.
    const resets =
      observedTarget != null && isWorld(observedTarget)
        ? observedTarget[internal].resetSubscriptions
        : undefined;
    const reset = () => {
      detach?.();
      detach = listen();
    };
    resets?.add(reset);
    return () => {
      resets?.delete(reset);
      detach?.();
    };
  });

  return {
    get current() {
      void version;
      return value;
    },
  };
}
