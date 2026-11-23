import { subscribeEntityEvent } from '../entity/entity';
import type { Entity } from '../entity/types';
import type { Identifier, IdentifierPair } from '../identifier/types';
import { createQuery, subscribeEnter, subscribeExit } from '../query/query';
import { isQuery } from '../query/utils/is-query';
import { getRelationTargets } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import type { Trait } from '../trait/types';
import type { WorldContext } from './types';

export function observeHas(
  this: WorldContext,
  entity: Entity,
  input: Trait | RelationPair | Identifier | IdentifierPair,
  push: (present: boolean) => void
) {
  const observer = this.observeSettled(() => push(entity.isAlive() && entity.has(input)));
  const filtered = isRelationPair(input) && input.targetQuery ? input : undefined;
  const term = filtered?.relation ?? input;
  const add = subscribeEntityEvent(this, entity, 'addSubscriptions', term, observer.invalidate);
  const remove = subscribeEntityEvent(this, entity, 'removeSubscriptions', term, observer.invalidate);
  let enter: (() => void) | undefined, exit: (() => void) | undefined;
  if (filtered) {
    const params = filtered.targetQuery;
    const ref = isQuery(params) ? params : createQuery(...params);
    const changed = (target: Entity) => {
      if (entity.isAlive() && getRelationTargets(this, filtered.relation, entity).includes(target)) {
        observer.invalidate();
      }
    };
    enter = subscribeEnter(this, ref, changed);
    exit = subscribeExit(this, ref, changed);
  }
  return () => {
    observer.unsubscribe();
    add();
    remove();
    enter?.();
    exit?.();
  };
}
