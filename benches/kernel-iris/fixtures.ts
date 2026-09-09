import type * as Kernel from '../../packages/core/src/kernel';
const kernel: typeof Kernel = await import(
  process.env.KOOTA_KERNEL_SOURCE ?? '../../packages/core/src/kernel/index.ts'
);

// Keep the optional checkout outside the workspace dependency graph.
export interface IrisApi {
  Type: { f64(): unknown };
  defineComponent(name: string, options?: { schema: Record<string, unknown> }): number;
  defineRelation(name: string): number;
  createWorld(): object;
  resetWorld(world: object): void;
  createEntity(world: object, entries?: readonly number[]): number;
  destroyEntity(world: object, entity: number): void;
  isEntityAlive(world: object, entity: number): boolean;
  addComponent(world: object, entity: number, component: number): void;
  removeComponent(world: object, entity: number, component: number): void;
  hasComponent(world: object, entity: number, component: number): boolean;
  setComponentValue(
    world: object,
    entity: number,
    component: number,
    field: string,
    value: number
  ): void;
  getComponentValue(world: object, entity: number, component: number, field: string): number;
  markComponentChanged(world: object, entity: number, component: number): void;
  pair(relation: number, target: number): number;
  getPairTarget(world: object, pair: number): number;
  EXPERIMENTAL_queryEntities(
    world: object,
    terms: readonly number[],
    callback: (entity: number) => void
  ): void;
  EXPERIMENTAL_queryColumns(
    world: object,
    terms: readonly number[],
    callback: (entities: number[], columns: { value: Float64Array }[]) => void
  ): void;
}

export const iris: IrisApi | null = process.env.IRIS_SOURCE
  ? await import(process.env.IRIS_SOURCE)
  : null;

export function createIrisDefinitions() {
  if (!iris) throw new Error('Set IRIS_SOURCE to the Iris source index.ts');
  return {
    values: [0, 1, 2].map((i) =>
      iris.defineComponent(`KootaComparisonValue${i}`, { schema: { value: iris.Type.f64() } })
    ),
    tags: [0, 1, 2, 3, 4, 5].map((i) => iris.defineComponent(`KootaComparisonTag${i}`)),
    relation: iris.defineRelation('KootaComparisonLink'),
  };
}

export function createKootaFixture(
  count = 10_000,
  scalarCount = 1,
  tagCount = 1,
  sharedPair = false,
  api: typeof Kernel = kernel
) {
  const ctx = api.createKernelContext();
  api.initializeKernel(ctx);
  const blueprints = Array.from({ length: scalarCount }, () => api.createTrait({ value: 0 }));
  const values = blueprints.map((trait) => api.resolveDefinition(ctx, trait));
  const tags = Array.from({ length: tagCount }, () => api.defineTrait(ctx));
  const relation = sharedPair ? api.defineRelation(ctx) : -1;
  api.reserveKernel(ctx, count + 32, count * (scalarCount + tagCount + (sharedPair ? 2 : 0)));
  const target = sharedPair ? api.tryCreateEntity(ctx) : -1;
  const pair = sharedPair ? api.pairEntity(ctx, relation, target) : -1;
  const entities = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const entity = api.tryCreateEntity(ctx);
    if (entity < 0) throw new Error('Entity capacity exhausted');
    entities[i] = entity;
    for (const value of values)
      if (api.tryAttachEntity(ctx, entity, value) !== 1) throw new Error('Value capacity exhausted');
    for (const tag of tags)
      if (api.tryAttachEntity(ctx, entity, tag) !== 1) throw new Error('Tag capacity exhausted');
    if (sharedPair && api.tryAttachEntity(ctx, entity, pair) !== 1)
      throw new Error('Pair capacity exhausted');
  }
  return {
    ctx,
    blueprints,
    values,
    tags,
    relation,
    target,
    pair,
    entities,
    buffer: new Float64Array(1),
  };
}

export function createIrisFixture(
  definitions: ReturnType<typeof createIrisDefinitions>,
  count = 10_000,
  scalarCount = 1,
  tagCount = 1,
  sharedPair = false
) {
  if (!iris) throw new Error('Set IRIS_SOURCE');
  const world = iris.createWorld();
  const values = definitions.values.slice(0, scalarCount);
  const tags = definitions.tags.slice(0, tagCount);
  const target = sharedPair ? iris.createEntity(world) : -1;
  const pair = sharedPair ? iris.pair(definitions.relation, target) : -1;
  const entries = values.concat(tags);
  if (sharedPair) entries.push(pair);
  const entities = new Int32Array(count);
  for (let i = 0; i < count; i++) entities[i] = iris.createEntity(world, entries);
  return { world, values, tags, relation: definitions.relation, target, pair, entities };
}

export function queryTerms(value: number, tags: number[]) {
  return Array.from({ length: 20 }, (_, combination) => {
    const terms = [value, tags[0]];
    for (let bit = 0; bit < 5; bit++) if ((combination + 1) & (1 << bit)) terms.push(tags[bit + 1]);
    return terms;
  });
}
