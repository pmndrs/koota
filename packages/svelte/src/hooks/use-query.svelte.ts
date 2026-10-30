import { $internal as internal, createQuery, type Entity, type QueryParameter } from '@koota/core';
import { untrack } from 'svelte';
import { useWorld } from '../world/world-context.js';

// Sorted by id so the array order is stable across versions and the DOM stays stable.
const byId = (a: Entity, b: Entity) => a.id() - b.id();

export function useQuery<T extends QueryParameter[]>(
  ...args: [...T] | [() => [...T]]
): { readonly current: Entity[] } {
  const getParams =
    args.length === 1 && typeof args[0] === 'function' && !(internal in args[0])
      ? (args[0] as () => [...T])
      : () => args as unknown as [...T];

  const world = useWorld();
  let result = $state.raw<Entity[]>(
    world.isRegistered
      ? world
          .query(createQuery(...getParams()))
          .toArray()
          .sort(byId)
      : []
  );
  let resetCount = $state(0);

  let cache: { hash: string; version: number; result: Entity[] } | null = null;

  $effect(() => {
    // Track resetCount so the effect re-runs on world reset
    void resetCount;

    const queryRef = createQuery(...getParams());

    const refresh = () => {
      const query = world[internal].queriesHashMap.get(queryRef.hash);

      if (query && cache?.hash === queryRef.hash && cache.version === query.version) {
        result = cache.result;
        return;
      }

      const next = world.query(queryRef).toArray().sort(byId);
      const registered = world[internal].queriesHashMap.get(queryRef.hash);

      if (registered) {
        cache = { hash: queryRef.hash, version: registered.version, result: next };
      }
      result = next;
    };

    /**
     * Cache invalidation: addEntityToQuery fires subscriptions before
     * bumping query.version, so the cache version check would incorrectly
     * hit on the stale (pre-bump) version. Force a fresh recompute.
     */
    const onChange = () => {
      cache = null;
      refresh();
    };

    refresh();

    const unsubAdd = world.onQueryAdd(queryRef, onChange);
    const unsubRemove = world.onQueryRemove(queryRef, onChange);

    /**
     * Catch query updates that happened between the initial read and
     * subscription attachment
     */
    const queryNow = world[internal].queriesHashMap.get(queryRef.hash);
    if (queryNow && cache && queryNow.version !== cache.version) {
      refresh();
    }

    // Runs inside whatever effect called world.reset(), so the read must not be tracked.
    const handleReset = () => {
      cache = null;
      untrack(() => resetCount++);
    };

    world[internal].resetSubscriptions.add(handleReset);

    return () => {
      world[internal].resetSubscriptions.delete(handleReset);
      unsubAdd();
      unsubRemove();
    };
  });

  return {
    get current() {
      return result;
    },
  };
}
