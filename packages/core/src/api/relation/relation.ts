import { compilePlan, defineRelation, entityAt, pairTargetIndex, setTraitHooks } from '../../kernel';
import type { Entity } from '../entity/types';
import { toPublic } from '../handles';
import { isQuery } from '../query/query';
import type { QueryParameter } from '../query/types';
import { $internal, $relation, $relationPair, type Brand } from '../symbols';
import { createTraitWithId, defineHookMethods, toKernelSchema } from '../trait/trait';
import type { Schema, Trait, TraitHook } from '../trait/types';
import type { WorldState } from '../world/state';
import type { Relation, RelationHook, RelationPair, RelationTarget } from './types';

export function relation<S extends Schema = Record<string, never>>(definition?: {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  /** Keep each target's sources in insertion order. Reorder with `entity.orderSources`. */
  ordered?: boolean;
  store?: S;
}): Relation<Trait<S>> {
  const schema = (definition?.store ?? {}) as S;
  const kernelSchema = toKernelSchema(schema);
  compilePlan(kernelSchema);

  let autoDestroy: 'source' | 'target' | false = false;
  if (definition?.autoDestroy === 'orphan' || definition?.autoDestroy === 'source') autoDestroy = 'source';
  else if (definition?.autoDestroy === 'target') autoDestroy = 'target';
  if (definition?.autoRemoveTarget) {
    console.warn("Koota: 'autoRemoveTarget' is deprecated. Use 'autoDestroy: \"orphan\"' instead.");
    autoDestroy = 'source';
  }

  const id = defineRelation({
    schema: kernelSchema,
    exclusive: definition?.exclusive ?? false,
    autoDestroy,
    ordered: definition?.ordered ?? false,
  });
  const relationTrait = createTraitWithId(id, schema) as unknown as Trait<S>;

  function relationFn(...args: unknown[]): RelationPair<Trait<S>> {
    const first = args[0];
    if (first === undefined) throw new Error('Koota: Relation target is undefined.');
    const self = relationFn as unknown as Relation<Trait<S>>;
    if (first === '*' || typeof first === 'number') {
      return {
        [$relationPair]: true,
        relation: self,
        target: first as RelationTarget,
        targetQuery: undefined,
        params: args[1] as Record<string, unknown> | undefined,
      };
    }
    if (isQuery(first)) {
      if (args.length > 1) throw new Error('Koota: Query relations do not accept additional parameters.');
      return { [$relationPair]: true, relation: self, target: undefined, targetQuery: first, params: undefined };
    }
    return {
      [$relationPair]: true,
      relation: self,
      target: undefined,
      targetQuery: args as QueryParameter[],
      params: undefined,
    };
  }

  const self = relationFn as unknown as Relation<Trait<S>>;
  const result = Object.assign(relationFn, {
    [$internal]: { id, trait: relationTrait, exclusive: definition?.exclusive ?? false, autoDestroy },
  }) as unknown as Relation<Trait<S>>;
  defineHookMethods(relationFn, {
    onAdd(hook: RelationHook<Trait<S>>): Relation<Trait<S>> {
      relationTrait.onAdd(hook as unknown as TraitHook<S>);
      return self;
    },
    onSet(hook: RelationHook<Trait<S>>): Relation<Trait<S>> {
      relationTrait.onSet(hook as unknown as TraitHook<S>);
      return self;
    },
    onRemove(hook: RelationHook<Trait<S>>): Relation<Trait<S>> {
      relationTrait.onRemove(hook as unknown as TraitHook<S>);
      return self;
    },
    onTargetDestroy(hook: RelationHook<Trait<S>>): Relation<Trait<S>> {
      if (typeof hook !== 'function') throw new Error('Koota: onTargetDestroy requires a function.');
      setTraitHooks(id, {
        onTargetDestroy(kernel, source, pairId, value) {
          const state = kernel.context as WorldState;
          const target: Entity = toPublic(state, entityAt(kernel, pairTargetIndex(pairId)));
          hook(value as never, toPublic(state, source), target);
        },
      });
      relationTrait[$internal].hooks.onTargetDestroy = hook as never;
      return self;
    },
  });
  Object.defineProperty(result, $relation, { value: true, writable: false, enumerable: false, configurable: false });
  relationTrait[$internal].relation = result;
  return result;
}

export function isRelation(value: unknown): value is Relation<Trait> {
  return (value as Brand<typeof $relation> | null | undefined)?.[$relation] === true;
}

export function isRelationPair(value: unknown): value is RelationPair {
  return (value as Brand<typeof $relationPair> | null | undefined)?.[$relationPair] === true;
}
