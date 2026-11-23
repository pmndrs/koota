import {
  $internal,
  $relationPair,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEffect, useRef } from 'react';
import { attachTrait, readTrait } from './use-trait';

export function useTraitEffect<T extends Trait>(
  target: Entity | World,
  trait: T,
  callback: (value: TraitRecord<T> | undefined) => void
): void;
export function useTraitEffect<T extends Trait>(
  target: Entity | World,
  trait: RelationPair<T>,
  callback: (value: TraitRecord<T> | undefined) => void
): void;
export function useTraitEffect<T extends Trait>(
  target: Entity | World,
  trait: T | RelationPair<T>,
  callback: (value: TraitRecord<T> | undefined) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Pairs are recreated per render, so the effect keys on their relation and target.
  const pair = trait as RelationPair;
  const relation = pair[$relationPair] ? pair.relation : trait;
  const pairTarget = pair[$relationPair] ? pair.target : undefined;

  useEffect(() => {
    const notify = (value: unknown) => callbackRef.current(value as TraitRecord<T> | undefined);
    const listen = (entity: Entity | undefined) => {
      if (entity === undefined) {
        notify(undefined);
        return;
      }
      if (!entity.isAlive()) return;
      const detach = attachTrait(entity, trait, notify);
      notify(readTrait(entity, trait));
      return detach;
    };
    return typeof target === 'number' ? listen(target) : target[$internal].observeWorldEntity(listen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, relation, pairTarget, pair.targetQuery]);
}
