import { $internal, createQuery, type Entity, type QueryParameter } from '@koota/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): Entity[] {
  const world = useWorld();
  const query = createQuery(...parameters);
  const store = useMemo(() => world[$internal].createQueryStore(query), [world, query]);
  const revision = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.read(revision);
}
