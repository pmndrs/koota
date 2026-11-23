import {
  $internal,
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
import { useEntityValue } from '../utils/use-entity-value';
import { useWorld } from '../world/use-world';

type HasInput = Trait | RelationPair | Identifier | IdentifierPair;

function readHas(entity: Entity, trait: HasInput) {
  return entity.has(trait);
}

function attachHas(entity: Entity, trait: HasInput, push: (value: boolean) => void) {
  const observer = entity[$internal].observeSettled(() =>
    push(entity.isAlive() && entity.has(trait))
  );
  // The hook overloads take no union. Core resolves every input and filters exact terms by key.
  const onAdd = entity.onAdd(trait as Trait, observer.invalidate);
  const onRemove = entity.onRemove(trait as Trait, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onAdd();
    onRemove();
  };
}

/** A relation filter also changes when a target of the entity enters or leaves the filter. */
function attachFilteredHas(
  world: World,
  entity: Entity,
  pair: RelationPair,
  push: (value: boolean) => void
) {
  const observer = entity[$internal].observeSettled(() => push(entity.isAlive() && entity.has(pair)));
  let subscriptions: (() => void)[];
  if (!entity.has(IsExcluded)) {
    // The pair is held while the entity is in the query for it. That query follows the pairs of
    // the entity and its targets entering or leaving the filter.
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
    const filter = pair.targetQuery!;
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

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  const provided = useWorld();
  const world = typeof target === 'object' && target ? target : provided;
  const pair = trait as RelationPair;
  const filtered = pair[$relationPair] === true && pair.targetQuery !== undefined;
  // Plain inputs keep the shared attach function, so only a relation filter allocates a closure.
  const attach = filtered
    ? (entity: Entity, input: HasInput, push: (value: boolean) => void) =>
        attachFilteredHas(world, entity, input as RelationPair, push)
    : attachHas;
  return useEntityValue(target, trait, readHas, attach) ?? false;
}
