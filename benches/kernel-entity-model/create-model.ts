import * as model from '../../packages/core/src/kernel/experimental/entity-kernel';
import {
  addTrait,
  createEntity,
  createKernelContext,
  createTrait,
  destroyEntity,
  destroyKernel,
  getTrait,
  hasTrait,
  hasRelationPair,
  initializeKernel,
  resolveQuery,
  runQuery,
  removeTrait,
  setTrait,
  $internal,
  type Trait,
  type Relation,
  type QueryInstance,
} from '../../packages/core/src/kernel';
import { $relation, $relationPair } from '../../packages/core/src/kernel/relation/symbols';
import type { RelationPair } from '../../packages/core/src/kernel/relation/types';

export type Model = {
  spawn(): number;
  define(): number;
  relation(): number;
  pair(relation: number, target: number): number;
  attach(entity: number, trait: number): void;
  detach(entity: number, trait: number): void;
  has(entity: number, trait: number): boolean;
  read(entity: number, trait: number): number;
  write(entity: number, trait: number, value: number): void;
  collect(traits: readonly number[], output: Uint32Array): number;
  destroy(entity: number): void;
  dispose(): void;
};

export function createModel(capacity: number, memberships: number): Model {
  const mode = process.env.KOOTA_ENTITY_MODEL ?? 'typed';
  if (mode === 'current') return createCurrent();
  if (mode !== 'packed' && mode !== 'typed') throw new Error(`Unknown entity model: ${mode}`);
  const kernel = model.createEntityKernel(capacity, memberships, mode);
  const valueBuffer = new Float64Array(1);
  return {
    spawn: () => model.spawn(kernel),
    define: () => model.spawn(kernel),
    relation: () => model.spawn(kernel),
    pair: (relation, target) => model.pair(kernel, relation, target),
    attach: (entity, trait) => {
      if (model.attach(kernel, entity, trait) < 0) throw new Error('Membership failed');
    },
    detach: (entity, trait) => {
      model.detach(kernel, entity, trait);
    },
    has: (entity, trait) => model.has(kernel, entity, trait),
    read: (entity, trait) => {
      model.readInto(kernel, entity, trait, valueBuffer);
      return valueBuffer[0];
    },
    write: (entity, trait, value) => {
      valueBuffer[0] = value;
      model.writeFrom(kernel, entity, trait, valueBuffer);
    },
    collect: (traits, output) => model.collect(kernel, traits, output),
    destroy: (entity) => {
      model.destroy(kernel, entity);
    },
    dispose: () => {},
  };
}

function createCurrent(): Model {
  const ctx = createKernelContext();
  initializeKernel(ctx);
  // Numeric tokens adapt current descriptors only for the shared benchmark fixture.
  const definitions: (Trait | RelationPair)[] = [];
  const relations: (Relation | null)[] = [];
  const pairs = new Map<number, Map<number, number>>();
  const queries = new Map<readonly number[], QueryInstance>();
  const writeValue = { value: 0 };
  return {
    spawn: () => createEntity(ctx),
    define: () => {
      definitions.push(createTrait({ value: 0 }));
      relations.push(null);
      return definitions.length - 1;
    },
    relation: () => {
      const trait = createTrait();
      const relation: Relation = {
        [$relation]: true,
        [$internal]: { trait, exclusive: false, autoDestroy: false },
      };
      trait[$internal].relation = relation;
      definitions.push(trait);
      relations.push(relation);
      return definitions.length - 1;
    },
    pair: (relation, target) => {
      let targets = pairs.get(relation);
      if (!targets) pairs.set(relation, (targets = new Map()));
      const existing = targets.get(target);
      if (existing !== undefined) return existing;
      definitions.push({ [$relationPair]: true, relation: relations[relation]!, target });
      relations.push(null);
      const id = definitions.length - 1;
      targets.set(target, id);
      return id;
    },
    attach: (entity, trait) => addTrait(ctx, entity, definitions[trait]),
    detach: (entity, trait) => removeTrait(ctx, entity, definitions[trait]),
    has: (entity, trait) => {
      const definition = definitions[trait];
      return typeof definition === 'function'
        ? hasTrait(ctx, entity, definition)
        : hasRelationPair(ctx, entity, definition);
    },
    read: (entity, trait) => getTrait(ctx, entity, definitions[trait]).value,
    write: (entity, trait, value) => {
      writeValue.value = value;
      setTrait(ctx, entity, definitions[trait], writeValue);
    },
    collect: (traits, output) => {
      let query = queries.get(traits);
      if (!query) {
        query = resolveQuery(
          ctx,
          traits.map((trait) => definitions[trait])
        );
        queries.set(traits, query);
      }
      const result = runQuery(ctx, query);
      const end = Math.min(result.length, output.length);
      for (let i = 0; i < end; i++) output[i] = result[i];
      return result.length;
    },
    destroy: (entity) => destroyEntity(ctx, entity),
    dispose: () => destroyKernel(ctx),
  };
}
