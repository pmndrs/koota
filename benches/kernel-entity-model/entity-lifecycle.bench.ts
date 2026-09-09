import { assert, bench, group } from '@pmndrs/labs';
import {
  attach,
  createEntityKernel,
  destroy,
  pair,
  readInto,
  spawn,
  writeFrom,
} from '../../packages/core/src/kernel/experimental/entity-kernel';

function create(capacity: number, memberships: number) {
  const storage = process.env.KOOTA_ENTITY_MODEL ?? 'typed';
  if (storage !== 'packed' && storage !== 'typed') throw new Error('Use packed or typed storage');
  return createEntityKernel(capacity, memberships, storage);
}

group('entity identity lifecycle 10k @entity-lifecycle', () => {
  bench('intern existing pairs', function* () {
    const kernel = create(20_016, 0);
    const relation = spawn(kernel);
    const targets = new Uint32Array(10_000);
    const pairs = new Uint32Array(10_000);
    for (let i = 0; i < targets.length; i++) {
      targets[i] = spawn(kernel);
      pairs[i] = pair(kernel, relation, targets[i]);
    }
    const result = yield () => {
      let matches = 0;
      for (let i = 0; i < targets.length; i++) {
        if (pair(kernel, relation, targets[i]) === pairs[i]) matches++;
      }
      return matches;
    };
    assert.equal(result, 10_000);
    assert.equal(kernel.size, 20_001);
    return result;
  });

  bench('recycle pair identities', function* () {
    const kernel = create(20_016, 0);
    const relation = spawn(kernel);
    const targets = new Uint32Array(10_000);
    const pairs = new Uint32Array(10_000);
    for (let i = 0; i < targets.length; i++) {
      targets[i] = spawn(kernel);
      pairs[i] = pair(kernel, relation, targets[i]);
    }
    yield {
      bench: () => {
        for (let i = 0; i < targets.length; i++) {
          destroy(kernel, pairs[i]);
          pairs[i] = pair(kernel, relation, targets[i]);
        }
      },
      snapshot: () => kernel.size,
    };
    assert.equal(kernel.size, 20_001);
    for (let i = 0; i < targets.length; i++) {
      assert.equal(pair(kernel, relation, targets[i]), pairs[i]);
    }
  });

  bench('delete target with ten thousand incoming memberships', function* () {
    const kernel = create(10_016, 10_000);
    const relation = spawn(kernel);
    const subjects = new Uint32Array(10_000);
    for (let i = 0; i < subjects.length; i++) subjects[i] = spawn(kernel);
    let target = 0;
    const populate = () => {
      target = spawn(kernel);
      const predicate = pair(kernel, relation, target);
      for (let i = 0; i < subjects.length; i++) {
        assert.equal(attach(kernel, subjects[i], predicate), 1);
      }
    };
    populate();
    let remaining = 0;
    yield {
      // Manual timing prevents Labs from batching repeated deletion of the same target.
      manual: () => {
        const start = performance.now();
        destroy(kernel, target);
        const elapsed = performance.now() - start;
        remaining = kernel.size;
        return elapsed * 1e6;
      },
      after: populate,
    };
    assert.equal(remaining, 10_001);
    assert.equal(kernel.size, 10_003);
    return remaining;
  });

  bench('write and read fractional scalar values', function* () {
    const kernel = create(10_016, 10_000);
    const valueBuffer = new Float64Array(1);
    const trait = spawn(kernel);
    const entities = new Uint32Array(10_000);
    for (let i = 0; i < entities.length; i++) {
      entities[i] = spawn(kernel);
      attach(kernel, entities[i], trait);
    }
    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < entities.length; i++) {
        valueBuffer[0] = i + 0.5;
        writeFrom(kernel, entities[i], trait, valueBuffer);
        readInto(kernel, entities[i], trait, valueBuffer);
        sum += valueBuffer[0];
      }
      return sum;
    };
    assert.equal(result, 50_000_000);
    return result;
  });
});
