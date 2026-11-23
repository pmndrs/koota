import {
  $internal as internal,
  createQuery,
  type Entity,
  type Query,
  type QueryInstance,
  type QueryParameter,
  type QueryView,
} from '@koota/core';
import { untrack } from 'svelte';
import { useWorld } from '../world/world-context.js';

// Sorted by id so the array order is stable across versions and the DOM stays stable.
const byId = (a: Entity, b: Entity) => a.id() - b.id();

// Each query revision has one consumable batch. Readers copy its view into their own arrays.
const batches = new WeakMap<QueryInstance, { version: number; view: QueryView }>();

export function useQuery<T extends QueryParameter[]>(
  ...args: [...T] | [() => [...T]]
): { readonly current: Entity[] } {
  const getParams =
    args.length === 1 && typeof args[0] === 'function' && !(internal in args[0])
      ? (args[0] as () => [...T])
      : () => args as unknown as [...T];

  const world = useWorld();
  let cache: { query: QueryInstance; version: number; entities: Entity[] } | undefined;

  function read(ref: Query): Entity[] {
    const current = world[internal].queriesHashMap.get(ref.hash);
    if (cache && cache.query === current && cache.version === current.version) return cache.entities;

    const batch = current?.isTracking ? batches.get(current) : undefined;
    const view = batch && batch.version === current?.version ? batch.view : world.query(ref);
    const query = world[internal].queriesHashMap.get(ref.hash)!;
    if (query.isTracking) batches.set(query, { version: query.version, view });
    const entities = view.toArray().sort(byId);
    cache = { query, version: query.version, entities };
    return entities;
  }

  let result = $state.raw<Entity[]>(world.isRegistered ? read(createQuery(...getParams())) : []);
  let resetCount = $state(0);

  $effect(() => {
    void resetCount;
    const queryRef = createQuery(...getParams());
    const refresh = () => {
      result = read(queryRef);
    };
    const observer = world[internal].observeSettled(refresh);
    const unsubEnter = world.onEnter(queryRef, observer.invalidate);
    const unsubExit = world.onExit(queryRef, observer.invalidate);

    // An update between initialization and subscription is visible in the query's version.
    refresh();

    // Runs inside whatever effect called world.reset(), so the read must not be tracked.
    const handleReset = () => {
      untrack(() => resetCount++);
    };

    world[internal].resetSubscriptions.add(handleReset);

    return () => {
      observer.unsubscribe();
      world[internal].resetSubscriptions.delete(handleReset);
      unsubEnter();
      unsubExit();
    };
  });

  return {
    get current() {
      return result;
    },
  };
}
