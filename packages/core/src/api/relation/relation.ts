import { $internal, $relation, $relationPair, Schema, isQuery } from '../../kernel';
import type { QueryParameter } from '../query/types';
import { trait } from '../trait/trait';
import type { Trait, TraitHooks } from '../trait/types';
import type { Relation, RelationPair } from './types';

function createRelation<S extends Schema = Record<string, never>>(definition?: {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  store?: S;
  hooks?: TraitHooks<S>;
}): Relation<Trait<S>> {
  const relationTrait = trait(
    definition?.store ?? ({} as S),
    definition?.hooks as TraitHooks<any>
  ) as unknown as Trait<S>;
  const traitCtx = relationTrait[$internal];

  traitCtx.relation = null!;

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
    autoDestroy,
  };

  function relationFn(...args: any[]): RelationPair<Trait<S>> {
    const firstArg = args[0];
    if (firstArg === undefined) throw Error('Relation target is undefined');

    if (firstArg === '*' || typeof firstArg === 'number') {
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        target: firstArg,
        params: args[1],
      };
    }

    if (isQuery(firstArg)) {
      if (args.length > 1) throw Error('Query relations do not accept additional parameters.');
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        targetQuery: firstArg,
      };
    }

    return {
      [$relationPair]: true,
      relation: relationFn as unknown as Relation<Trait<S>>,
      targetQuery: args as QueryParameter[],
    };
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

  traitCtx.relation = relation;

  return relation;
}

export const relation = createRelation;
