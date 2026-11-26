import {
  $relationPair,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEffect, useRef } from 'react';
import { attachTrait, readTrait } from './use-trait';
import { subscribeTarget } from '../utils/use-entity-value';
import { useWorld } from '../world/use-world';

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
  useWorld();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Pairs are recreated per render, so the effect keys on their relation and target.
  const pair = trait as RelationPair;
  const relation = pair[$relationPair] ? pair.relation : trait;
  const pairTarget = pair[$relationPair] ? pair.target : undefined;

  useEffect(() => {
    const notify = (value: unknown) => callbackRef.current(value as TraitRecord<T> | undefined);
    let current: Entity | undefined;
    const update = () => {
      if (current === undefined) notify(undefined);
      else if (current.isAlive()) notify(readTrait(current, trait));
    };
    const attach = (entity: Entity | undefined) => {
      current = entity;
      if (entity?.isAlive()) return attachTrait(entity, trait, notify);
    };
    const stop = subscribeTarget(target, attach, update);
    try {
      update();
    } catch (error) {
      stop?.();
      throw error;
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, relation, pairTarget, pair.targetQuery]);
}
