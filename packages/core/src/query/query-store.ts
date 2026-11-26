import type { Entity } from '../entity/types';
import type { WorldContext } from '../world/types';
import { queryInternal, resolveQueryInstanceFromRef } from './query';
import type { Query, QueryInstance, QueryView } from './types';

// A tracking query consumes its batch on read. All hook readers of that revision share the view.
const batches = new WeakMap<QueryInstance, { version: number; view: QueryView }>();

export function createQueryStore(this: WorldContext, ref: Query) {
  let source: QueryInstance | undefined;
  let version: number | undefined;
  let revision = 0;
  let copiedRevision = -1;
  let entities: Entity[] = [];

  const getSnapshot = () => {
    const current = this.queriesHashMap.get(ref.hash);
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
        const view =
          batch && batch.version === source?.version ? batch.view : queryInternal(this, ref);
        entities = view.toArray().sort((a, b) => a.id() - b.id());
        // Running a tracking query advances its batch and version.
        source = this.queriesHashMap.get(ref.hash)!;
        copiedRevision = revision;
        version = source.version;
        if (source.isTracking) batches.set(source, { version, view });
      }
      return entities;
    },
    subscribe: (notify: () => void) => {
      const observer = this.observeSettled(notify);
      let query: QueryInstance | undefined;
      const detach = () => {
        query?.addSubscriptions?.delete(observer.invalidate);
        query?.removeSubscriptions?.delete(observer.invalidate);
        query = undefined;
      };
      const reset = () => {
        detach();
        const entity = this.worldEntity;
        observer.invalidate();
        if (entity == null || entity !== this.worldEntity) return;
        const next = resolveQueryInstanceFromRef(this, ref);
        if (entity !== this.worldEntity || !this.resetSubscriptions.has(reset)) return;
        query = next;
        (query.addSubscriptions ??= new Set()).add(observer.invalidate);
        (query.removeSubscriptions ??= new Set()).add(observer.invalidate);
      };
      const stop = () => {
        this.resetSubscriptions.delete(reset);
        observer.unsubscribe();
        detach();
      };
      this.resetSubscriptions.add(reset);
      try {
        reset();
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    },
  };
}
