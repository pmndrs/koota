import { $internal as internal, createQuery, type Entity, type QueryParameter } from '@koota/core';
import { untrack } from 'svelte';
import { useWorld } from '../world/world-context.js';

export function useQuery<T extends QueryParameter[]>(
  ...args: [...T] | [() => [...T]]
): { readonly current: Entity[] } {
  const getParams =
    args.length === 1 && typeof args[0] === 'function' && !(internal in args[0])
      ? (args[0] as () => [...T])
      : () => args as unknown as [...T];

  const world = useWorld();
  const store = $derived(world[internal].createQueryStore(createQuery(...getParams())));
  let revision = $state(0);

  $effect(() => {
    const notify = () => untrack(() => revision++);
    return store.subscribe(notify);
  });

  return {
    get current() {
      void revision;
      return store.read(store.getSnapshot());
    },
  };
}
