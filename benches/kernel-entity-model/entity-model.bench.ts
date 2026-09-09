import { assert, bench, group } from '@pmndrs/labs';
import { createModel, type Model } from './create-model';

group('entity model foundation 10k @entity-model', () => {
  bench('cold create and populate scalar memberships', function* () {
    let model: Model | null = null;
    yield {
      bench: () => {
        model = createModel(10_016, 30_000);
        const trait = model.define();
        for (let i = 0; i < 10_000; i++) model.attach(model.spawn(), trait);
      },
      snapshot: () => model!.collect([], new Uint32Array(0)) >= 10_000,
      after: () => {
        model!.dispose();
        model = null;
      },
    };
  });

  bench('warm entity recycling with three memberships', function* () {
    const model = createModel(10_016, 30_000);
    const traits = [model.define(), model.define(), model.define()];
    const entities = new Float64Array(10_000);
    for (let i = 0; i < entities.length; i++) {
      entities[i] = model.spawn();
      for (let t = 0; t < traits.length; t++) model.attach(entities[i], traits[t]);
    }
    const output = new Uint32Array(0);
    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          model.destroy(entities[i]);
          const entity = model.spawn();
          entities[i] = entity;
          for (let t = 0; t < traits.length; t++) model.attach(entity, traits[t]);
        }
      },
      snapshot: () => model.collect(traits, output),
    };
    assert.equal(model.collect(traits, output), 10_000);
    model.dispose();
  });

  bench('warm membership detach and attach', function* () {
    const model = createModel(10_016, 10_000);
    const trait = model.define();
    const entities = new Float64Array(10_000);
    for (let i = 0; i < entities.length; i++) {
      entities[i] = model.spawn();
      model.attach(entities[i], trait);
    }
    const result = yield () => {
      let count = 0;
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        model.detach(entity, trait);
        model.attach(entity, trait);
        if (model.has(entity, trait)) count++;
      }
      return count;
    };
    assert.equal(result, 10_000);
    model.dispose();
    return result;
  });

  bench('warm scalar write and read', function* () {
    const model = createModel(10_016, 10_000);
    const trait = model.define();
    const entities = new Float64Array(10_000);
    for (let i = 0; i < entities.length; i++) {
      entities[i] = model.spawn();
      model.attach(entities[i], trait);
    }
    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < entities.length; i++) {
        model.write(entities[i], trait, i);
        sum += model.read(entities[i], trait);
      }
      return sum;
    };
    assert.equal(result, 49_995_000);
    model.dispose();
    return result;
  });

  bench('collect intersection into caller buffer', function* () {
    const model = createModel(10_016, 20_000);
    const traits = [model.define(), model.define()];
    for (let i = 0; i < 10_000; i++) {
      const entity = model.spawn();
      model.attach(entity, traits[0]);
      if (i % 2 === 0) model.attach(entity, traits[1]);
    }
    const output = new Uint32Array(10_000);
    model.collect(traits, output);
    const result = yield () => model.collect(traits, output);
    assert.equal(result, 5_000);
    for (let i = 0; i < result; i++) {
      assert.equal(model.has(output[i], traits[0]), true);
      assert.equal(model.has(output[i], traits[1]), true);
    }
    model.dispose();
    return result;
  });

  bench('warm relation membership churn with shared pair', function* () {
    const model = createModel(10_016, 10_000);
    const relation = model.relation();
    const target = model.spawn();
    const pair = model.pair(relation, target);
    const entities = new Float64Array(10_000);
    for (let i = 0; i < entities.length; i++) {
      entities[i] = model.spawn();
      model.attach(entities[i], pair);
    }
    const result = yield () => {
      let count = 0;
      for (let i = 0; i < entities.length; i++) {
        model.detach(entities[i], pair);
        model.attach(entities[i], pair);
        if (model.has(entities[i], pair)) count++;
      }
      return count;
    };
    assert.equal(result, 10_000);
    model.dispose();
    return result;
  });
});
