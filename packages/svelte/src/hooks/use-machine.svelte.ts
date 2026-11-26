import { whenSettled, type Entity, type Machine, type MachineStates, type World } from '@koota/core';
import { untrack } from 'svelte';
import { createTargetResolver, subscribeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useMachine<S extends MachineStates>(
  target: () => Entity | World | undefined | null,
  machine: MaybeGetter<Machine<S>>
): { readonly current: S[keyof S] | undefined } {
  const resolveTarget = createTargetResolver();
  const binding = $derived.by(() => {
    const subject = target();
    const selected = resolve(machine);
    const resolved = resolveTarget(subject);
    return {
      subject,
      selected,
      value: resolved && selected.current(resolved.world, resolved.entity),
    };
  });
  // Self-transitions replace data while keeping the same member trait.
  let version = $state(0);

  $effect(() => {
    const current = binding;
    return subscribeTarget(resolveTarget, current.subject, (resolved) => {
      const update = () => {
        current.value =
          resolved && resolved.world.has(resolved.entity)
            ? current.selected.current(resolved.world, resolved.entity)
            : undefined;
        untrack(() => version++);
      };
      update();
      if (resolved === undefined) return;
      const { world, entity } = resolved;
      return world.onTransition(entity, current.selected, whenSettled(update));
    });
  });

  return {
    get current() {
      void version;
      return binding.value;
    },
  };
}
