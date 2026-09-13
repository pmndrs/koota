import type { Archetype } from './archetype';
import type { Entity, TypeId } from './id';
import type { World } from './world';

export type Events = {
  entityCreated: [entity: Entity];
  /** Before the entity's traits are removed. Data is still readable. */
  entityDestroying: [entity: Entity];
  entityDestroyed: [entity: Entity];
  /** After the move and data write, before query subscribers. */
  traitAdded: [type: TypeId, entity: Entity];
  /** Before the move. The departing value is still readable. */
  traitRemoving: [type: TypeId, entity: Entity];
  traitChanged: [type: TypeId, entity: Entity];
  archetypeCreated: [archetype: Archetype];
  archetypeDestroyed: [archetype: Archetype];
  worldReset: [];
};

export type EventName = keyof Events;
export type Observer<E extends EventName> = (...args: Events[E]) => void;

export type ObserverState = { [E in EventName]: readonly Observer<E>[] };

export function createObserverState(): ObserverState {
  return {
    entityCreated: [],
    entityDestroying: [],
    entityDestroyed: [],
    traitAdded: [],
    traitRemoving: [],
    traitChanged: [],
    archetypeCreated: [],
    archetypeDestroyed: [],
    worldReset: [],
  };
}

type AnyObserver = (...args: never[]) => void;

/** Lists are replaced on change, so dispatch never sees a mutating array. */
export function observe<E extends EventName>(world: World, event: E, callback: Observer<E>): () => void {
  const observers = world.observers as unknown as Record<EventName, readonly AnyObserver[]>;
  observers[event] = [...observers[event], callback as AnyObserver];
  return () => {
    const list = observers[event];
    const index = list.indexOf(callback as AnyObserver);
    if (index >= 0) observers[event] = list.filter((_, i) => i !== index);
  };
}

/** Fixed arity avoids allocating rest arguments on the mutation path. */
export function fire(world: World, event: EventName, a?: unknown, b?: unknown): void {
  const list = world.observers[event] as readonly ((a?: unknown, b?: unknown) => void)[];
  for (let i = 0; i < list.length; i++) list[i](a, b);
}
