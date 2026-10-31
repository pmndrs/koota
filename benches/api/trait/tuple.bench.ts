import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';
import { vec3 } from 'math';

// vec3 data stored as one interleaved tuple column.
const TuplePosition = trait({ value: vec3.create() });
const TupleVelocity = trait({ value: vec3.fromValues(1, 2, 3) });

const dt = 0.5;
const integrated = 10_000 * 2 * dt;

group('vec3 tuple fields 10k @trait @tuple', () => {
  bench('entity.get', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, (_, x) =>
      world.spawn(TuplePosition({ value: [x, 0, 0] }))
    );

    const sum = yield () => {
      let sum = 0;
      for (const entity of entities) sum += entity.get(TuplePosition)!.value[0];
      return sum;
    };

    assert.equal(sum, 49_995_000);
    world.destroy();
    return sum;
  });

  bench('entity.set', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(TuplePosition));
    const value = vec3.create();
    let frame = 0;

    yield {
      bench: () => {
        frame ^= 1;
        vec3.set(value, frame, frame, frame);
        for (const entity of entities) entity.set(TuplePosition, { value });
      },
      snapshot: () => {
        assert.equal(entities[9999].get(TuplePosition)!.value, [frame, frame, frame]);
        return entities.length;
      },
    };
    world.destroy();
  });

  bench('updateEach integrate', function* () {
    const world = createWorld();
    for (let i = 0; i < 10_000; i++) world.spawn(TuplePosition, TupleVelocity);
    const query = world.query(TuplePosition, TupleVelocity);

    yield {
      bench: () =>
        query.updateEach(([position, velocity]) => {
          vec3.scaleAndAdd(position.value, position.value, velocity.value, dt);
        }),
      snapshot: () => {
        let y = 0;
        query.readEach(([position]) => (y += position.value[1]));
        assert.equal(y, integrated);
        return y;
      },
    };
    world.destroy();
  });

  bench('getPages integrate', function* () {
    const world = createWorld();
    for (let i = 0; i < 10_000; i++) world.spawn(TuplePosition, TupleVelocity);
    const query = world.query(TuplePosition, TupleVelocity);

    yield {
      bench: () => {
        for (const {
          stores: [position, velocity],
          indices,
        } of query.getPages()) {
          for (let i = 0; i < indices.length; i++) {
            const o = indices[i] * 3;
            position.value[o] += velocity.value[o] * dt;
            position.value[o + 1] += velocity.value[o + 1] * dt;
            position.value[o + 2] += velocity.value[o + 2] * dt;
          }
        }
      },
      snapshot: () => {
        let y = 0;
        query.readEach(([position]) => (y += position.value[1]));
        assert.equal(y, integrated);
        return y;
      },
    };
    world.destroy();
  });
});
