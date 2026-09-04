import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useCallback, useEffect, useState } from 'react';
import { getEntityTraits } from '../model/entity-info';

type Unsubscribe = () => void;
type Subscribe = (world: World, notify: () => void) => Unsubscribe;

function combine(unsubscribes: Unsubscribe[]): Unsubscribe {
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

function onReset(world: World, notify: () => void): Unsubscribe {
  const subscriptions = world[$internal].resetSubscriptions;
  subscriptions.add(notify);
  return () => subscriptions.delete(notify);
}

/**
 * Reads a value from the world and reads it again whenever the subscription
 * fires. Both callbacks must be referentially stable or the subscription is
 * torn down and rebuilt on every render.
 */
function useWorldValue<T>(world: World, read: (world: World) => T, subscribe: Subscribe): T {
  const [value, setValue] = useState(() => read(world));

  useEffect(() => {
    const notify = () => setValue(read(world));
    notify();
    return subscribe(world, notify);
  }, [world, read, subscribe]);

  return value;
}

const readTraits = (world: World) => Array.from(world.traits);
const subscribeTraits: Subscribe = (world, notify) =>
  combine([world.onTraitRegistered(notify), onReset(world, notify)]);

export function useWorldTraits(world: World): Trait[] {
  return useWorldValue(world, readTraits, subscribeTraits);
}

const readEntities = (world: World) => [...world.entities];
const readEntityCount = (world: World) => world.entities.length;
const subscribeEntities: Subscribe = (world, notify) =>
  combine([world.onEntitySpawn(notify), world.onEntityDestroy(notify), onReset(world, notify)]);

export function useWorldEntities(world: World): Entity[] {
  return useWorldValue(world, readEntities, subscribeEntities);
}

export function useEntityCount(world: World): number {
  return useWorldValue(world, readEntityCount, subscribeEntities);
}

export function useTraitEntities(world: World, trait: Trait): Entity[] {
  const read = useCallback((w: World) => [...w.query(trait)], [trait]);
  const subscribe = useCallback<Subscribe>(
    (w, notify) => combine([w.onAdd(trait, notify), w.onRemove(trait, notify)]),
    [trait]
  );
  return useWorldValue(world, read, subscribe);
}

export function useTraitEntityCount(world: World, trait: Trait): number {
  const read = useCallback((w: World) => w.query(trait).length, [trait]);
  const subscribe = useCallback<Subscribe>(
    (w, notify) => combine([w.onAdd(trait, notify), w.onRemove(trait, notify)]),
    [trait]
  );
  return useWorldValue(world, read, subscribe);
}

/**
 * The traits on one entity. Koota only emits add and remove events per trait,
 * so every registered trait is watched and events for other entities are
 * ignored. The list is read back from the world after each event because
 * relation events fire once per target.
 */
export function useEntityTraits(world: World, entity: Entity): Trait[] {
  const [traits, setTraits] = useState(() => getEntityTraits(world, entity));

  useEffect(() => {
    const unsubscribes: Unsubscribe[] = [];
    let scheduled = false;

    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        setTraits(world.has(entity) ? getEntityTraits(world, entity) : []);
      });
    };

    const watch = (trait: Trait) => {
      unsubscribes.push(
        world.onAdd(trait, (changed) => changed === entity && refresh()),
        world.onRemove(trait, (changed) => changed === entity && refresh())
      );
    };

    setTraits(getEntityTraits(world, entity));
    for (const trait of world.traits) watch(trait);
    unsubscribes.push(world.onTraitRegistered(watch));
    unsubscribes.push(world.onEntityDestroy((destroyed) => destroyed === entity && refresh()));

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [world, entity]);

  return traits;
}

/**
 * The entities holding a relation to one target. Relation events fire for
 * every target, so the result is recomputed on a short debounce instead of
 * filtering each event.
 */
export function useRelationSources(world: World, relation: Relation<Trait>, target: Entity) {
  const [sources, setSources] = useState<Entity[]>([]);

  useEffect(() => {
    const update = () => {
      const result: Entity[] = [];
      for (const entity of world.query(relation('*'))) {
        if (entity.targetsFor(relation).includes(target)) result.push(entity);
      }
      setSources(result);
    };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timeout);
      timeout = setTimeout(update, 50);
    };

    update();
    const unsubscribe = combine([
      world.onAdd(relation, schedule),
      world.onRemove(relation, schedule),
      world.onChange(relation, schedule),
    ]);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [world, relation, target]);

  return sources;
}
