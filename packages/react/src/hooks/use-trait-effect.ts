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
    const ctx = typeof target === 'number' ? undefined : target[$internal];
    let detach: (() => void) | undefined;
    const reset = () => {
      detach?.();
      detach = undefined;
      const entity = typeof target === 'number' ? target : target[$internal].worldEntity;
      if (entity == null) return notify(undefined);
      if (!entity.isAlive()) return;
      const next = attachTrait(entity, trait, notify);
      if (ctx && (ctx.worldEntity !== entity || !ctx.resetSubscriptions.has(reset))) return next();
      detach = next;
      notify(readTrait(entity, trait));
    };
    const stop = () => {
      ctx?.resetSubscriptions.delete(reset);
      detach?.();
    };
    ctx?.resetSubscriptions.add(reset);
    try {
      reset();
    } catch (error) {
      stop();
      throw error;
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, relation, pairTarget, pair.targetQuery]);
}
