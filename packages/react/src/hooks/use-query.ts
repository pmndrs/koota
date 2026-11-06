import { observeSettled } from '../utils/observe-settled';
import {
  $internal,
  createQuery,
  type Entity,
  type Query,
  type QueryInstance,
  type QueryParameter,
  type QueryView,
  type World,
} from '@koota/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useWorld } from '../world/use-world';

// A tracking query consumes its batch on read. All React readers of that revision share the view.
const batches = new WeakMap<QueryInstance, { version: number; view: QueryView }>();

function createQueryStore(world: World, ref: Query) {
  const ctx = world[$internal];
  let source: QueryInstance | undefined;
  let version: number | undefined;
  let revision = 0;
  let copiedRevision = -1;
  let entities: Entity[] = [];

  function getSnapshot() {
    const current = ctx.queriesHashMap.get(ref.hash);
    if (source !== current || version !== current?.version) {
      source = current;
      version = current?.version;
      revision++;
    }
    return revision;
  }

  return {
    getSnapshot,
    // Copy in render so a burst of membership changes only materializes the final list.
    read(revision: number) {
      if (copiedRevision !== revision) {
        const batch = source?.isTracking ? batches.get(source) : undefined;
        const view = batch && batch.version === source?.version ? batch.view : world.query(ref);
        entities = view.toArray().sort((a, b) => a.id() - b.id());
        copiedRevision = revision;
        // Running a tracking query advances its batch and version.
        source = ctx.queriesHashMap.get(ref.hash)!;
        version = source.version;
        if (source.isTracking) batches.set(source, { version, view });
      }
      return entities;
    },
    subscribe: (notify: () => void) => {
      const observer = observeSettled(ctx, notify);
      function listen() {
        const offAdd = world.onQueryAdd(ref, observer.invalidate);
        const offRemove = world.onQueryRemove(ref, observer.invalidate);
        return () => {
          offAdd();
          offRemove();
        };
      }
      let detach = listen();
      const reset = () => {
        detach();
        detach = listen();
        observer.invalidate();
      };
      ctx.resetSubscriptions.add(reset);
      return () => {
        observer.unsubscribe();
        ctx.resetSubscriptions.delete(reset);
        detach();
      };
    },
  };
}

export function useQuery<T extends QueryParameter[]>(...parameters: T): Entity[] {
  const world = useWorld();
  const ref = createQuery(...parameters);
  const store = useMemo(() => createQueryStore(world, ref), [world, ref]);
  const revision = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.read(revision);
}
