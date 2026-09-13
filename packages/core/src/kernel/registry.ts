import {
  Any,
  encodePair,
  entityIndex,
  INDEX_MASK,
  isPair,
  isWildcardPair,
  MAX_RELATIONS,
  PAIR_FLAG,
  pairRelationIndex,
  type Entity,
  type PairId,
  type TraitId,
  type TypeId,
} from './id';
import { compilePlan, type ColumnPlan, type Schema } from './schema';
import type { World } from './world';

/** 0 none, 1 destroys sources when their target dies, 2 destroys targets when the source dies. */
export type AutoDestroy = 0 | 1 | 2;

/**
 * Trait hooks run from the mutation path itself. `onAdd` and `onSet` receive
 * the record before it is committed, so what they leave in `value` is what
 * gets written. `onRemove` receives the departing value. Tags receive
 * `undefined`. Pairs pass the pair id as the type.
 */
export type TraitHook = (world: World, entity: Entity, type: TypeId, value: unknown) => void;
/** Runs for each source of a pair whose target is being destroyed, before the pair is removed. */
export type TargetDestroyHook = (world: World, source: Entity, pair: PairId, value: unknown) => void;

export type TraitHooks = {
  onAdd: TraitHook | null;
  onSet: TraitHook | null;
  onRemove: TraitHook | null;
  onTargetDestroy: TargetDestroyHook | null;
};

export type Definition = {
  readonly id: TraitId;
  /** -1 for traits, otherwise the index used inside pair ids. */
  readonly relationIndex: number;
  readonly plan: ColumnPlan | null;
  readonly exclusive: boolean;
  readonly autoDestroy: AutoDestroy;
  /** Stored outside archetypes, so adding or removing it never moves the entity. */
  readonly sparse: boolean;
  /** Relations only: each target keeps its sources in insertion order. */
  readonly ordered: boolean;
  hooks: TraitHooks | null;
  /** Set once the trait enters an archetype or pair store. Hooks freeze then. */
  used: boolean;
};

/** Global definition registry, indexed by trait id. Slot 0 is unused. */
export const definitions: (Definition | undefined)[] = [undefined];

/** Relation index to trait id. Index 0 is the wildcard relation. */
export const relations: TraitId[] = [];

/** 1 for sparse traits, aligned with `definitions`, so a miss on an archetype lookup can test storage with one load. */
export const sparseFlags: number[] = [0];

export type TraitOptions = { sparse?: boolean };

export function defineTrait(schema?: Schema, options?: TraitOptions): TraitId {
  const id = definitions.length;
  if (id > INDEX_MASK) throw new Error('Koota: Trait limit exceeded.');
  const sparse = options?.sparse === true;
  definitions.push({
    id,
    relationIndex: -1,
    plan: compilePlan(schema),
    exclusive: false,
    autoDestroy: 0,
    sparse,
    ordered: false,
    hooks: null,
    used: false,
  });
  sparseFlags.push(sparse ? 1 : 0);
  return id;
}

/** Whether a trait id is stored outside archetypes. Pairs are not traits and answer false. */
export function isSparseTrait(type: TypeId): boolean {
  return type < PAIR_FLAG && sparseFlags[type] === 1;
}

export type RelationOptions = {
  schema?: Schema;
  exclusive?: boolean;
  autoDestroy?: 'source' | 'target' | 'orphan' | false;
  /** Keep each target's sources in insertion order, reorderable with `setSources`. */
  ordered?: boolean;
};

export function defineRelation(options?: RelationOptions): TraitId {
  const relationIndex = relations.length;
  if (relationIndex >= MAX_RELATIONS) throw new Error('Koota: Relation limit exceeded.');
  const id = definitions.length;
  if (id > INDEX_MASK) throw new Error('Koota: Trait limit exceeded.');
  const policy = options?.autoDestroy;
  const autoDestroy: AutoDestroy = policy === 'source' || policy === 'orphan' ? 1 : policy === 'target' ? 2 : 0;
  definitions.push({
    id,
    relationIndex,
    plan: compilePlan(options?.schema),
    exclusive: options?.exclusive ?? false,
    autoDestroy,
    sparse: false,
    ordered: options?.ordered === true,
    hooks: null,
    used: false,
  });
  sparseFlags.push(0);
  relations.push(id);
  return id;
}

/** Wildcard relation. `pair(Wildcard, target)` matches any relation to the target. */
export const Wildcard: TraitId = defineRelation();

export function getDefinition(id: TraitId): Definition {
  const definition = definitions[id];
  if (!definition) throw new Error('Koota: Unknown definition.');
  return definition;
}

const HOOK_NAMES = ['onAdd', 'onSet', 'onRemove', 'onTargetDestroy'] as const;

/**
 * Installs hooks on a definition. Each slot accepts one hook, and nothing can
 * be installed once the trait is in use, so archetypes never rebuild their
 * hook tables.
 */
export function setTraitHooks(id: TraitId, hooks: Partial<TraitHooks>): void {
  const definition = getDefinition(id);
  if (definition.used) throw new Error('Koota: Hooks must be installed before the trait is used in a world.');
  const current: TraitHooks = definition.hooks ?? { onAdd: null, onSet: null, onRemove: null, onTargetDestroy: null };
  for (let i = 0; i < HOOK_NAMES.length; i++) {
    const name = HOOK_NAMES[i];
    const hook = hooks[name];
    if (hook === undefined || hook === null) continue;
    if (name === 'onTargetDestroy' && definition.relationIndex < 0) {
      throw new Error('Koota: onTargetDestroy hooks require a relation.');
    }
    if (current[name] !== null) throw new Error(`Koota: The trait already has an ${name} hook.`);
    (current as Record<string, unknown>)[name] = hook;
  }
  definition.hooks = current;
}

export function isRelation(id: TypeId): boolean {
  return !isPair(id) && (definitions[id]?.relationIndex ?? -1) >= 0;
}

/**
 * Builds a pair id. The target is an entity handle or `Any`. Only the
 * target's index is encoded, so callers validate the handle first.
 */
export function pair(relation: TraitId, target: Entity): PairId {
  const definition = definitions[relation];
  if (!definition || definition.relationIndex < 0) throw new Error('Koota: pair() requires a relation.');
  if (isPair(target)) throw new Error('Koota: A pair target cannot be a pair.');
  return encodePair(definition.relationIndex, target === Any ? Any : entityIndex(target));
}

export function pairRelation(pair: PairId): TraitId {
  return relations[pairRelationIndex(pair)];
}

/** Column plan for a type. Tags, wildcard pairs, and schema-less relations have none. */
export function typePlan(type: TypeId): ColumnPlan | null {
  if (!isPair(type)) return definitions[type]?.plan ?? null;
  if (isWildcardPair(type)) return null;
  return definitions[relations[pairRelationIndex(type)]]?.plan ?? null;
}

/** Hooks for a type. Relation aggregates have none; concrete pairs use their relation's. */
export function typeHooks(type: TypeId): TraitHooks | null {
  if (!isPair(type)) return definitions[type]?.hooks ?? null;
  if (isWildcardPair(type)) return null;
  return definitions[relations[pairRelationIndex(type)]]?.hooks ?? null;
}

/** Freezes the hooks of a type once storage for it exists. */
export function markUsed(type: TypeId): void {
  const definition = isPair(type) ? definitions[relations[pairRelationIndex(type)]] : definitions[type];
  if (definition) definition.used = true;
}

export function relationDefinition(pair: PairId): Definition {
  return definitions[relations[pairRelationIndex(pair)]]!;
}
