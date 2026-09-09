import { assert, bench, group } from '@pmndrs/labs';
import * as kernel from '../../packages/core/src/kernel';
import { createKootaFixture } from './fixtures';

if (process.env.KOOTA_BEFORE_SOURCE) {
  const before: typeof kernel = await import(process.env.KOOTA_BEFORE_SOURCE);
  group('query lifecycle 10k @kernel-query-lifecycle', () => {
    for (const [variant, api] of [
      ['before', before],
      ['after', kernel],
    ] as const) {
      bench(`100 changed values and consume ${variant}`, function* () {
        const f = createKootaFixture(10_000, 1, 1, false, api);
        const changed = api.createModifier('changed', api.createTrackingId(), f.blueprints);
        const query = api.resolveQuery(f.ctx, [changed]);
        const output = new Uint32Array(10_000);
        api.reserveKernel(f.ctx, 10_032, 20_000);
        const result = yield () => {
          for (let i = 0; i < 100; i++) {
            f.buffer[0] = i;
            api.writeEntityValues(f.ctx, f.entities[i * 100], f.values[0], f.buffer);
          }
          return api.collectQueryInto(f.ctx, query, output);
        };
        assert.equal(result, 100);
        api.destroyKernel(f.ctx);
        return result;
      });
      bench(`tracked tag toggle and consume ${variant}`, function* () {
        const f = createKootaFixture(10_000, 1, 1, false, api);
        const blueprint = Array.from(api.getKernelTraits(f.ctx)).find(
          (t) => api.resolveDefinition(f.ctx, t) === f.tags[0]
        )!;
        const added = api.createModifier('added', api.createTrackingId(), [blueprint]);
        const query = api.resolveQuery(f.ctx, [added]);
        const access = api.prepareEntityAccess(f.ctx, f.tags[0]);
        const output = new Uint32Array(10_000);
        api.reserveKernel(f.ctx, 10_032, 20_000);
        const result = yield () => {
          for (let i = 0; i < f.entities.length; i++) {
            api.detachPrepared(access, f.entities[i]);
            api.tryAttachPrepared(access, f.entities[i]);
          }
          return api.collectQueryInto(f.ctx, query, output);
        };
        assert.equal(result, 10_000);
        api.destroyKernel(f.ctx);
        return result;
      });
      bench(`first tracking population ${variant}`, function* () {
        const trackingId = api.createTrackingId();
        const prepare = () => {
          const f = createKootaFixture(0, 2, 0, false, api);
          const added = api.createModifier('added', trackingId, f.blueprints);
          api.reserveKernel(f.ctx, 10_032, 20_000);
          const output = new Uint32Array(10_000);
          api.trySpawnBatch(api.prepareSpawnPlan(f.ctx, f.values), output);
          return { f, added, output };
        };
        let state = prepare();
        let count = 0;
        yield {
          manual: () => {
            const start = performance.now();
            count = api.collectQueryInto(
              state.f.ctx,
              api.resolveQuery(state.f.ctx, [state.added]),
              state.output
            );
            return (performance.now() - start) * 1e6;
          },
          after: () => {
            assert.equal(count, 10_000);
            api.destroyKernel(state.f.ctx);
            state = prepare();
          },
        };
        api.destroyKernel(state.f.ctx);
        return count;
      });
      bench(`destroy tracked population ${variant}`, function* () {
        const trackingId = api.createTrackingId();
        const prepare = () => {
          const f = createKootaFixture(10_000, 1, 1, false, api);
          const changed = api.createModifier('changed', trackingId, f.blueprints);
          api.resolveQuery(f.ctx, [changed]);
          api.reserveKernel(f.ctx, 10_032, 20_000);
          api.writeEntityValues(f.ctx, f.entities[0], f.values[0], f.buffer);
          return f;
        };
        let f = prepare();
        yield {
          manual: () => {
            const start = performance.now();
            for (let i = 0; i < f.entities.length; i++) api.destroyEntity(f.ctx, f.entities[i]);
            return (performance.now() - start) * 1e6;
          },
          after: () => {
            assert.equal(api.getKernelEntities(f.ctx).length, 2);
            api.destroyKernel(f.ctx);
            f = prepare();
          },
        };
        api.destroyKernel(f.ctx);
        return 10_000;
      });
      bench(`relation-only snapshot ${variant}`, function* () {
        const f = createKootaFixture(10_000, 1, 0, true, api);
        api.createEntity(f.ctx, api.createTrait());
        const relation = Array.from(api.getKernelTraits(f.ctx)).find(
          (t) => t[api.$internal].relation
        )![api.$internal].relation!;
        const pair = { [api.$relationPair]: true as const, relation, target: f.target };
        const result = yield () => api.queryRelation(f.ctx, pair).length;
        assert.equal(result, 10_000);
        api.destroyKernel(f.ctx);
        return result;
      });
    }
  });
}
