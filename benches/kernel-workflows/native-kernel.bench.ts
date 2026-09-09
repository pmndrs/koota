import { assert, bench, group } from '@pmndrs/labs';
import {
  collectQueryInto,
  visitQuery,
  attachEntity,
  createKernelContext,
  defineRelation,
  defineTrait,
  destroyKernel,
  detachEntity,
  initializeKernel,
  pairEntity,
  readEntityValues,
  reserveKernel,
  selectEntities,
  tryAttachEntity,
  tryCreateEntity,
  writeEntityValues,
} from '../../packages/core/src/kernel';

function fixture() {
  const ctx = createKernelContext();
  initializeKernel(ctx);
  const value = defineTrait(ctx, { x: 0, y: 0 });
  const tag = defineTrait(ctx);
  const link = defineRelation(ctx);
  reserveKernel(ctx, 10_100, 40_000);
  const target = tryCreateEntity(ctx);
  const pair = pairEntity(ctx, link, target);
  const entities = new Uint32Array(10_000);
  for (let i = 0; i < entities.length; i++) {
    const entity = tryCreateEntity(ctx);
    entities[i] = entity;
    assert.equal(tryAttachEntity(ctx, entity, value), 1);
    assert.equal(tryAttachEntity(ctx, entity, tag), 1);
    assert.equal(tryAttachEntity(ctx, entity, pair), 1);
  }
  const query = selectEntities(ctx, [value, tag]);
  reserveKernel(ctx, 10_100, 40_000);
  return {
    ctx,
    value,
    tag,
    pair,
    entities,
    query,
    values: new Float64Array(2),
    output: new Uint32Array(10_000),
  };
}

group('prepared native kernel @kernel-native', () => {
  bench('buffered fractional values 10k', function* () {
    const f = fixture();
    const result = yield () => {
      let total = 0;
      for (let i = 0; i < f.entities.length; i++) {
        f.values[0] = i + 0.5;
        f.values[1] = -i - 0.25;
        writeEntityValues(f.ctx, f.entities[i], f.value, f.values);
        readEntityValues(f.ctx, f.entities[i], f.value, f.values);
        total += f.values[0] + f.values[1];
      }
      return total;
    };
    assert.equal(result, 2500);
    destroyKernel(f.ctx);
    return result;
  });
  bench('bounded tag detach and attach 10k', function* () {
    const f = fixture();
    const result = yield () => {
      let total = 0;
      for (let i = 0; i < f.entities.length; i++) {
        detachEntity(f.ctx, f.entities[i], f.tag);
        total += tryAttachEntity(f.ctx, f.entities[i], f.tag);
      }
      return total;
    };
    assert.equal(result, 10_000);
    destroyKernel(f.ctx);
    return result;
  });
  bench('bounded pair detach and attach 10k', function* () {
    const f = fixture();
    const result = yield () => {
      let total = 0;
      for (let i = 0; i < f.entities.length; i++) {
        detachEntity(f.ctx, f.entities[i], f.pair);
        total += tryAttachEntity(f.ctx, f.entities[i], f.pair);
      }
      return total;
    };
    assert.equal(result, 10_000);
    destroyKernel(f.ctx);
    return result;
  });
  bench('caller-owned query output 10k', function* () {
    const f = fixture();
    const result = yield () => collectQueryInto(f.ctx, f.query, f.output);
    assert.equal(result, 10_000);
    destroyKernel(f.ctx);
    return result;
  });
  bench('deferred tag detach and attach 10k', function* () {
    const f = fixture();
    const visit = (entities: Readonly<ArrayLike<number>>, count: number) => {
      for (let i = 0; i < count; i++) {
        detachEntity(f.ctx, entities[i], f.tag);
        attachEntity(f.ctx, entities[i], f.tag);
      }
    };
    yield () => visitQuery(f.ctx, f.query, visit);
    assert.equal(collectQueryInto(f.ctx, f.query, f.output), 10_000);
    destroyKernel(f.ctx);
  });
});
