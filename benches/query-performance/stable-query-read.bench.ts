import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait } from 'koota';

const ENTITY_COUNT = 16_384;
const READS_PER_SAMPLE = 1_000;
const EXPECTED_LENGTH_SUM = ENTITY_COUNT * READS_PER_SAMPLE;
const EXPECTED_VISITS = ENTITY_COUNT * READS_PER_SAMPLE;

const IsBatched = trait();
const SpriteUV = trait({ x: 0, y: 0, width: 1, height: 1 });
const BatchedSprites = createQuery(IsBatched, SpriteUV);

group('stable query read 16,384 entities x 1,000 reads @query', () => {
  bench('repeated retrieval 1,000 reads', function* () {
    const world = createWorld();
    for (let i = 0; i < ENTITY_COUNT; i++) world.spawn(IsBatched, SpriteUV);

    if (world.query(IsBatched, SpriteUV).length !== ENTITY_COUNT) {
      throw new Error('Warm-up retrieval did not match every entity');
    }

    yield () => {
      let lengthSum = 0;
      for (let i = 0; i < READS_PER_SAMPLE; i++) {
        lengthSum += world.query(IsBatched, SpriteUV).length;
      }
      if (lengthSum !== EXPECTED_LENGTH_SUM) {
        throw new Error('Repeated retrieval returned the wrong entity count');
      }
    };

    world.destroy();
  }).gc('inner');

  bench('compiled query retrieval 1,000 reads', function* () {
    const world = createWorld();
    for (let i = 0; i < ENTITY_COUNT; i++) world.spawn(IsBatched, SpriteUV);

    if (world.query(BatchedSprites).length !== ENTITY_COUNT) {
      throw new Error('Warm-up compiled retrieval did not match every entity');
    }

    yield () => {
      let lengthSum = 0;
      for (let i = 0; i < READS_PER_SAMPLE; i++) {
        lengthSum += world.query(BatchedSprites).length;
      }
      if (lengthSum !== EXPECTED_LENGTH_SUM) {
        throw new Error('Compiled retrieval returned the wrong entity count');
      }
    };

    world.destroy();
  }).gc('inner');

  bench('cached snapshot iteration 1,000 passes', function* () {
    const world = createWorld();
    for (let i = 0; i < ENTITY_COUNT; i++) world.spawn(IsBatched, SpriteUV);

    const cachedResult = world.query(IsBatched, SpriteUV);
    if (cachedResult.length !== ENTITY_COUNT) {
      throw new Error('Cached snapshot did not match every entity');
    }

    let expectedChecksum = 0;
    for (let pass = 0; pass < READS_PER_SAMPLE; pass++) {
      for (const entity of cachedResult) {
        expectedChecksum = (expectedChecksum + entity) | 0;
      }
    }

    yield () => {
      let checksum = 0;
      let visits = 0;
      for (let pass = 0; pass < READS_PER_SAMPLE; pass++) {
        for (const entity of cachedResult) {
          checksum = (checksum + entity) | 0;
          visits++;
        }
      }
      if (visits !== EXPECTED_VISITS) {
        throw new Error('Cached snapshot iteration visited the wrong entity count');
      }
      if (checksum !== expectedChecksum) {
        throw new Error('Cached snapshot iteration produced the wrong entity checksum');
      }
    };

    world.destroy();
  }).gc('inner');

  bench('combined retrieve+iterate 1,000 loops', function* () {
    const world = createWorld();
    for (let i = 0; i < ENTITY_COUNT; i++) world.spawn(IsBatched, SpriteUV);

    let expectedChecksum = 0;
    for (let pass = 0; pass < READS_PER_SAMPLE; pass++) {
      for (const entity of world.query(IsBatched, SpriteUV)) {
        expectedChecksum = (expectedChecksum + entity) | 0;
      }
    }

    yield () => {
      let checksum = 0;
      let visits = 0;
      for (let pass = 0; pass < READS_PER_SAMPLE; pass++) {
        for (const entity of world.query(IsBatched, SpriteUV)) {
          checksum = (checksum + entity) | 0;
          visits++;
        }
      }
      if (visits !== EXPECTED_VISITS) {
        throw new Error('Combined retrieve+iterate visited the wrong entity count');
      }
      if (checksum !== expectedChecksum) {
        throw new Error('Combined retrieve+iterate produced the wrong entity checksum');
      }
    };

    world.destroy();
  }).gc('inner');
});
