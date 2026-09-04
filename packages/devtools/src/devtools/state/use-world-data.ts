import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useCallback, useEffect, useState } from 'react';
import { getEntityTraits } from '../model/entity-info';
import { readTraitCounts, readTraitEntities } from '../model/trait-membership';
import { createThrottle } from './throttle';

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

/** Add and remove events for every trait in the world, including traits registered later. */
function onAnyTraitEvent(world: World, callback: (entity: Entity) => void): Unsubscribe {
  const unsubscribes: Unsubscribe[] = [];
  const watch = (trait: Trait) => {
    unsubscribes.push(world.onAdd(trait, callback), world.onRemove(trait, callback));
  };
  for (const trait of world.traits) watch(trait);
  unsubscribes.push(world.onTraitRegistered(watch));
  return combine(unsubscribes);
}

/**
 * Reads a value from the world and reads it again, throttled, whenever the subscription
 * fires. The subscription callback must stay cheap since the app pays for it on every
 * event; all the work happens in `read`, at most once per interval. Both callbacks must be
 * referentially stable or the subscription is torn down and rebuilt on every render.
 */
function useWorldValue<T>(world: World, read: (world: World) => T, subscribe: Subscribe): T {
  const [value, setValue] = useState(() => read(world));

  useEffect(() => {
    setValue(read(world));
    const refresh = createThrottle(() => setValue(read(world)));
    const unsubscribe = subscribe(world, refresh.schedule);
    return () => {
      refresh.cancel();
      unsubscribe();
    };
  }, [world, read, subscribe]);

  return value;
}

const readTraits = (world: World) => Array.from(world.traits);
const subscribeTraits: Subscribe = (world, notify) =>
  combine([world.onTraitRegistered(notify), onReset(world, notify)]);

export function useWorldTraits(world: World): Trait[] {
  return useWorldValue(world, readTraits, subscribeTraits);
}

// `world.entities` copies the alive list, so the count is read from the index instead.
const readEntities = (world: World) => world.entities;
const readEntityCount = (world: World) => world[$internal].entityIndex.aliveCount;
const subscribeEntities: Subscribe = (world, notify) =>
  combine([world.onEntitySpawn(notify), world.onEntityDestroy(notify), onReset(world, notify)]);

export function useWorldEntities(world: World): Entity[] {
  return useWorldValue(world, readEntities, subscribeEntities);
}

export function useEntityCount(world: World): number {
  return useWorldValue(world, readEntityCount, subscribeEntities);
}

export function useTraitEntities(world: World, trait: Trait): Entity[] {
  const read = useCallback((w: World) => readTraitEntities(w, trait), [trait]);
  const subscribe = useCallback<Subscribe>(
    (w, notify) => combine([w.onAdd(trait, notify), w.onRemove(trait, notify)]),
    [trait]
  );
  return useWorldValue(world, read, subscribe);
}

const subscribeMemberships: Subscribe = (world, notify) =>
  combine([onAnyTraitEvent(world, notify), onReset(world, notify)]);

/** How many entities carry each trait, for every trait in the world. */
export function useTraitCounts(world: World): Map<Trait, number> {
  return useWorldValue(world, readTraitCounts, subscribeMemberships);
}

/**
 * The traits on one entity. Koota only emits add and remove events per trait, so every
 * registered trait is watched and events for other entities are ignored. The list is read
 * back from the world after each event because relation events fire once per target.
 */
export function useEntityTraits(world: World, entity: Entity): Trait[] {
  const [traits, setTraits] = useState(() => getEntityTraits(world, entity));

  useEffect(() => {
    setTraits(getEntityTraits(world, entity));
    const refresh = createThrottle(() => {
      setTraits(world.has(entity) ? getEntityTraits(world, entity) : []);
    });
    const onEvent = (changed: Entity) => {
      if (changed === entity) refresh.schedule();
    };
    const unsubscribe = combine([onAnyTraitEvent(world, onEvent), world.onEntityDestroy(onEvent)]);

    return () => {
      refresh.cancel();
      unsubscribe();
    };
  }, [world, entity]);

  return traits;
}

/**
 * The entities holding a relation to one target. Relation events fire for every target, so
 * the result is recomputed on the throttle instead of filtering each event.
 */
export function useRelationSources(world: World, relation: Relation<Trait>, target: Entity) {
  const read = useCallback(
    (w: World) => {
      const sources: Entity[] = [];
      for (const entity of readTraitEntities(w, relation[$internal].trait)) {
        if (entity.targetsFor(relation).includes(target)) sources.push(entity);
      }
      return sources;
    },
    [relation, target]
  );
  const subscribe = useCallback<Subscribe>(
    (w, notify) =>
      combine([
        w.onAdd(relation, notify),
        w.onRemove(relation, notify),
        w.onChange(relation, notify),
      ]),
    [relation]
  );
  return useWorldValue(world, read, subscribe);
}
