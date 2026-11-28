import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { isQuery, isStableParameter, sameParams } from '../query/query';
import type { QueryParameter } from '../query/types';
import type { TraitSchema } from '../storage/types';
import { createTraitDefinition, pairTraitAccessors } from '../trait/trait';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type { Relation, RelationDefinition, RelationPair } from './types';

function createRelation<S extends TraitSchema = Record<string, never>>(
  definition: RelationDefinition<S> & { exclusive: true }
): Relation<Trait<S>, true>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S> & { exclusive?: false }
): Relation<Trait<S>, false>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S>
): Relation<Trait<S>>;
function createRelation<S extends TraitSchema = Record<string, never>>(
  definition?: RelationDefinition<S>
): Relation<Trait<S>> {
  const relationTrait = createTraitDefinition(
    definition?.store ?? ({} as S),
    'relation',
    pairTraitAccessors
  ) as unknown as Trait<S>;
  const traitCtx = relationTrait[$internal];

  let autoDestroy: 'source' | 'target' | false = false;
  if (definition?.autoDestroy === 'orphan' || definition?.autoDestroy === 'source') {
    autoDestroy = 'source';
  } else if (definition?.autoDestroy === 'target') {
    autoDestroy = 'target';
  }

  if (definition?.autoRemoveTarget) {
    console.warn("Koota: 'autoRemoveTarget' is deprecated. Use 'autoDestroy: \"orphan\"' instead.");
    autoDestroy = 'source';
  }

  const relationCtx = {
    trait: relationTrait,
    exclusive: definition?.exclusive ?? false,
    sharedTargets: undefined,
    sharedTargetPageCount: 0,
    autoDestroy,
    scopedIdentifiers: undefined,
  };

  // A wildcard pair holds nothing of its own, so every call returns this one.
  const wildcard: RelationPair<Trait<S>> = {
    [$relationPair]: true,
    relation: relationFn as unknown as Relation<Trait<S>>,
    target: '*',
    params: undefined,
  };

  // Pairs whose target query is the same objects on every call, listed under its first entry.
  const targetQueryPairs = new WeakMap<object, RelationPair<Trait<S>>[]>();

  function relationFn(...args: any[]): RelationPair<Trait<S>> {
    const firstArg = args[0];
    if (firstArg === '*') return wildcard;

    if (typeof firstArg === 'number') {
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        target: firstArg as Entity,
        params: args[1],
      };
    }

    if (firstArg === undefined) throw Error('Relation target is undefined');

    const shared = targetQueryPairs.get(firstArg);
    if (shared !== undefined) {
      for (let i = 0; i < shared.length; i++) {
        const targetQuery = shared[i].targetQuery!;
        // A target query compares by identity. Inline parameters are compared entry by entry.
        if (
          targetQuery === firstArg
            ? args.length === 1
            : sameParams(targetQuery as readonly QueryParameter[], args)
        ) {
          return shared[i];
        }
      }
    }

    if (isQuery(firstArg) && args.length > 1) {
      throw Error('Query relations do not accept additional parameters.');
    }
    const pair: RelationPair<Trait<S>> = {
      [$relationPair]: true,
      relation: relationFn as unknown as Relation<Trait<S>>,
      targetQuery: isQuery(firstArg) ? firstArg : (args as QueryParameter[]),
    };
    if (isStableParameter(pair)) {
      if (shared === undefined) targetQueryPairs.set(firstArg, [pair]);
      else shared.push(pair);
    }
    return pair;
  }

  const relation = Object.assign(relationFn, {
    [$internal]: relationCtx,
  }) as Relation<Trait<S>>;

  Object.defineProperty(relation, $relation, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // Pairs share the relation's data trait, so its records fit every target.
  Object.defineProperty(relation, 'record', {
    value: relationTrait.record,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  traitCtx.relation = relation;
  traitCtx.onRegister = registerRelation;

  return relation;
}

function registerRelation(ctx: WorldContext, instance: TraitInstance) {
  ctx.relations.push(instance.trait[$internal].relation!);
}

export const relation = createRelation;

export const $relationPair = Symbol.for('relationPair');
export const $relation = Symbol.for('relation');
export const $orderedTargetsTrait = Symbol.for('orderedTargetsTrait');

export /* @inline @pure */ function isRelationPair(value: unknown): value is RelationPair {
  return !!(value as RelationPair | null | undefined)?.[$relationPair];
}
