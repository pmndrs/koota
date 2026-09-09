import { assert, bench, group } from '@pmndrs/labs';
import {
  createEntityKernel,
  type EntityKernel,
} from '../../packages/core/src/kernel/experimental/entity-kernel';

group('entity model empty capacity @entity-capacity', () => {
  for (const capacity of [128, 10_016, 100_016]) {
    bench(`${capacity} identities and ${capacity * 3} memberships`, function* () {
      const storage = process.env.KOOTA_ENTITY_MODEL ?? 'typed';
      if (storage !== 'packed' && storage !== 'typed') throw new Error('Use packed or typed storage');
      let kernel: EntityKernel | null = null;
      yield {
        bench: () => {
          kernel = createEntityKernel(capacity, capacity * 3, storage);
        },
        snapshot: () => {
          assert.equal(kernel!.size, 0);
          return kernel!.capacity;
        },
        after: () => {
          kernel = null;
        },
      };
    });
  }
});
