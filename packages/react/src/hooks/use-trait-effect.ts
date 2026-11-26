import {
  $relationPair,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEffect, useRef } from 'react';
import { subscribeTarget, useResolvedWorld } from '../utils/use-entity-value';
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
  const world = useResolvedWorld(target)!;
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
      else if (world.has(current)) notify(readTrait(world, current, trait));
    };
    const attach = (entity: Entity | undefined) => {
      current = entity;
      if (entity !== undefined && world.has(entity)) {
        return attachTrait(world, entity, trait, notify);
      }
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
  }, [world, target, relation, pairTarget, pair.targetQuery]);
}
