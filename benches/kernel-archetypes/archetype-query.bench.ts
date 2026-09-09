import { assert, bench, group } from '@pmndrs/labs';
import {
  attachEntity,
  collectQueryInto,
  createEntity,
  createKernelContext,
  createTrait,
  resolveDefinition,
  resolveQuery,
  destroyKernel,
  detachEntity,
  initializeKernel,
  reserveKernel,
} from '../../packages/core/src/kernel';
import * as archetype from './archetype-graph';

function fixture() {
  const graph = archetype.createArchetypeGraph(10_000, 6);
  const ctx = createKernelContext();
  initializeKernel(ctx);
  const definitions = Array.from({ length: 6 }, () => createTrait());
  const traits = definitions.map((definition) => resolveDefinition(ctx, definition));
  reserveKernel(ctx, 10_006, 60_000);
  const entities = new Uint32Array(10_000);
  for (let i = 0; i < entities.length; i++) {
    const mask = i & 63;
    archetype.spawn(graph, mask);
    const entity = createEntity(ctx);
    entities[i] = entity;
    for (let bit = 0; bit < 6; bit++) if (mask & (1 << bit)) attachEntity(ctx, entity, traits[bit]);
  }
  const masks = Array.from({ length: 20 }, (_, i) => i + 1);
  const graphQueries = masks.map((mask) => archetype.compile(graph, mask));
  const kernelQueries = masks.map((mask) =>
    resolveQuery(
      ctx,
      definitions.filter((_, bit) => mask & (1 << bit))
    )
  );
  return {
    graph,
    ctx,
    traits,
    entities,
    graphQueries,
    kernelQueries,
    output: new Uint32Array(10_000),
  };
}

group('query storage and structural movement @kernel-archetypes', () => {
  bench('cached entity query copy', function* () {
    const f = fixture();
    const expected = archetype.collect(f.graph, f.graphQueries[6], f.output);
    const result = yield () => collectQueryInto(f.ctx, f.kernelQueries[6], f.output);
    assert.equal(result, expected);
    destroyKernel(f.ctx);
    return result;
  });
  bench('archetype query copy', function* () {
    const f = fixture();
    const expected = collectQueryInto(f.ctx, f.kernelQueries[6], f.output);
    const result = yield () => archetype.collect(f.graph, f.graphQueries[6], f.output);
    assert.equal(result, expected);
    destroyKernel(f.ctx);
    return result;
  });
  bench('cached entity queries toggle 10k', function* () {
    const f = fixture();
    yield () => {
      for (let i = 0; i < f.entities.length; i++) {
        if (i & 1) {
          detachEntity(f.ctx, f.entities[i], f.traits[0]);
          attachEntity(f.ctx, f.entities[i], f.traits[0]);
        } else {
          attachEntity(f.ctx, f.entities[i], f.traits[0]);
          detachEntity(f.ctx, f.entities[i], f.traits[0]);
        }
      }
    };
    assert.equal(collectQueryInto(f.ctx, f.kernelQueries[0], f.output), 5000);
    destroyKernel(f.ctx);
  });
  bench('archetype graph toggle 10k', function* () {
    const f = fixture();
    yield () => {
      for (let i = 0; i < f.entities.length; i++) {
        archetype.toggle(f.graph, i, 0);
        archetype.toggle(f.graph, i, 0);
      }
    };
    assert.equal(archetype.collect(f.graph, f.graphQueries[0], f.output), 5000);
    destroyKernel(f.ctx);
  });
});
