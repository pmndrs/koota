import { subscribeHook, whenSettled } from '../command/settled';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import type { WorldContext } from '../world/types';
import { ensureQueryInstance } from './registry';
import type { Query, QueryInstance, QueryView } from './types';
import { runQuery } from './view';

// A tracking query consumes its batch on read. All hook readers of that revision share the view.
const batches = new WeakMap<QueryInstance, { version: number; view: QueryView }>();

export function createQueryStore(this: WorldContext, query: Query) {
  let source: QueryInstance | undefined;
  let version: number | undefined;
  let revision = 0;
  let copiedRevision = -1;
  let entities: Entity[] = [];

  const getSnapshot = () => {
    const current = this.queriesHashMap.get(query.hash);
    if (source !== current || version !== current?.version) {
      source = current;
      version = current?.version;
      revision++;
    }
    return revision;
  };

  return {
    getSnapshot,
    // Copy in render so a burst of membership changes only materializes the final list.
    read: (revision: number) => {
      if (copiedRevision !== revision) {
        if (this.worldEntity == null) {
          copiedRevision = revision;
          entities = [];
          return entities;
        }

        const batch = source?.isTracking ? batches.get(source) : undefined;
        const view = batch && batch.version === source?.version ? batch.view : runQuery(this, query);
        entities = view.toArray().sort((a, b) => getEntityId(a) - getEntityId(b));
        // Running a tracking query advances its batch and version.
        source = this.queriesHashMap.get(query.hash)!;
        copiedRevision = revision;
        version = source.version;
        if (source.isTracking) batches.set(source, { version, view });
      }
      return entities;
    },
    subscribe: (notify: () => void) =>
      subscribeHook(this, whenSettled(notify), (refresh) => {
        const bind = () => {
          if (this.worldEntity == null) return;
          const instance = ensureQueryInstance(this, query);
          const enter = (instance.addSubscriptions ??= new Set());
          const exit = (instance.removeSubscriptions ??= new Set());
          enter.add(refresh);
          exit.add(refresh);
          return () => {
            enter.delete(refresh);
            exit.delete(refresh);
          };
        };
        refresh();
        let detach = bind();
        const reset = () => {
          detach?.();
          detach = bind();
          refresh();
        };
        this.resetSubscriptions.add(reset);
        return () => {
          this.resetSubscriptions.delete(reset);
          detach?.();
        };
      }),
  };
}
