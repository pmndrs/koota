import {
  $internal as internal,
  createQuery,
  getQueryVersion,
  type QueryParameter,
  type QueryResult,
} from '@koota/core';
import { untrack } from 'svelte';
import { useWorld } from '../world/world-context.js';

export function useQuery<T extends QueryParameter[]>(
  ...args: [...T] | [() => [...T]]
): { readonly current: QueryResult<T> } {
  const getParams =
    args.length === 1 && typeof args[0] === 'function' && !(internal in args[0])
      ? (args[0] as () => [...T])
      : () => args as unknown as [...T];

  const world = useWorld();
  let result = $state.raw<QueryResult<T>>(
    world.isRegistered
      ? world.query(createQuery(...getParams())).sort()
      : ([] as unknown as QueryResult<T>)
  );
  let resetCount = $state(0);

  let cache: { hash: string; version: number; result: QueryResult<T> } | null = null;

  $effect(() => {
    // Track resetCount so the effect re-runs on world reset
    void resetCount;

    const queryRef = createQuery(...getParams());

    const refresh = () => {
      const version = getQueryVersion(world, queryRef);

      if (version !== undefined && cache?.hash === queryRef.hash && cache.version === version) {
        result = cache.result;
        return;
      }

      const next = world.query(queryRef).sort();
      const registeredVersion = getQueryVersion(world, queryRef);

      if (registeredVersion !== undefined) {
        cache = { hash: queryRef.hash, version: registeredVersion, result: next };
      }
      result = next;
    };

    // Subscription updates always refresh the cached result.
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
    const versionNow = getQueryVersion(world, queryRef);
    if (versionNow !== undefined && cache && versionNow !== cache.version) {
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
