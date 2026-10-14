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
    worldReset: [],
  };
}

type AnyObserver = (...args: never[]) => void;

/** Observers that only act on types the layer above marked with `watchType`. They do not make the world loud. */
const typed = new WeakSet<object>();

function hasUntyped(list: readonly object[]): boolean {
  for (let i = 0; i < list.length; i++) if (!typed.has(list[i])) return true;
  return false;
}

/**
 * Recomputes `world.quiet`. Call after anything that adds or removes a trait
 * observer or an observed dynamic query, which includes every observed
 * tracking query. A tracking query nobody observes only reads stamps and
 * removal history when it is collected, so it leaves the world quiet.
 */
export function refreshQuiet(world: World): void {
  const o = world.observers;
  world.quiet =
    !hasUntyped(o.traitAdded) &&
    !hasUntyped(o.traitRemoving) &&
    !hasUntyped(o.traitChanged) &&
    world.observedDynamic.length === 0;
}

/**
 * Marks or clears a plain trait as having a listener among the typed
 * observers. Fused mutations of a marked trait take the general path that
 * fires them.
 */
export function watchType(world: World, type: TypeId, watched: boolean): void {
  if ((world.watched[type] === true) === watched) return;
  world.watched[type] = watched ? true : undefined;
  world.watchEpoch++;
}

/** Lists are replaced on change, so dispatch never sees a mutating array. */
export function observe<E extends EventName>(world: World, event: E, callback: Observer<E>): () => void {
  const observers = world.observers as unknown as Record<EventName, readonly AnyObserver[]>;
  observers[event] = [...observers[event], callback as AnyObserver];
  refreshQuiet(world);
  return () => {
    const list = observers[event];
    const index = list.indexOf(callback as AnyObserver);
    if (index >= 0) observers[event] = list.filter((_, i) => i !== index);
    refreshQuiet(world);
  };
}

/**
 * `observe` for a trait observer that acts only on types marked with
 * `watchType`. It does not make the world loud, and trait mutations of an
 * unmarked type skip it.
 */
export function observeTyped<E extends 'traitAdded' | 'traitRemoving' | 'traitChanged'>(
  world: World,
  event: E,
  callback: Observer<E>
): () => void {
  typed.add(callback);
  return observe(world, event, callback);
}

/** Fixed arity avoids allocating rest arguments on the mutation path. */
export function fire(world: World, event: EventName, a?: unknown, b?: unknown): void {
  const list = world.observers[event] as readonly ((a?: unknown, b?: unknown) => void)[];
  for (let i = 0; i < list.length; i++) list[i](a, b);
}
