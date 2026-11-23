import {
  $internal as internal,
  $relationPair,
  createQuery,
  IsExcluded,
  type Entity,
  type Identifier,
  type IdentifierPair,
  type Query,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';

/** Calls update whenever the answer to entity.has(trait) may have changed. */
export function attachHas(
  world: World,
  entity: Entity,
  trait: Trait | RelationPair | Identifier | IdentifierPair,
  update: () => void
) {
  const observer = entity[internal].observeSettled(update);
  const pair = trait as RelationPair;
  const filter = pair[$relationPair] ? pair.targetQuery : undefined;
  let subscriptions: (() => void)[];
  if (filter === undefined) {
    subscriptions = [
      entity.onAdd(trait as Trait, observer.invalidate),
      entity.onRemove(trait as Trait, observer.invalidate),
    ];
  } else if (!entity.has(IsExcluded)) {
    // A relation filter is held while the entity is in the query for it. That query follows the
    // pairs of the entity and its targets entering or leaving the filter.
    const ref = createQuery(pair);
    subscriptions = [
      entity.onEnter(ref, observer.invalidate),
      entity.onExit(ref, observer.invalidate),
    ];
  } else {
    // Queries skip an excluded entity such as the world entity, so its pairs and the filter are
    // watched directly.
    const changed = (target: Entity) => {
      if (entity.isAlive() && entity.targetsFor(pair.relation).includes(target)) {
        observer.invalidate();
      }
    };
    const ref = Array.isArray(filter) ? createQuery(...filter) : (filter as Query);
    subscriptions = [
      entity.onAdd(pair.relation, observer.invalidate),
      entity.onRemove(pair.relation, observer.invalidate),
      world.onEnter(ref, changed),
      world.onExit(ref, changed),
    ];
  }
  return () => {
    observer.unsubscribe();
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
