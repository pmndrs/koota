import type { Entity } from '../entity/types';

/**
 * Stably sorts the first length key/entity pairs, using distinct scratch arrays.
 * Keys must be numbers other than NaN. Returns either entity array with its sorted prefix.
 */
export function sortKeys(
  keys: number[],
  entities: Entity[],
  scratchKeys: number[],
  scratchEntities: Entity[],
  runs: number[],
  length: number
): Entity[] {
  let count = 0;
  let start = 0;
  while (start < length) {
    runs[count++] = start;
    let end = start + 1;
    if (end < length && keys[end] < keys[start]) {
      while (end < length && keys[end] < keys[end - 1]) end++;
      // Strict descent keeps equal keys in their input order when a run is reversed.
      for (let left = start, right = end - 1; left < right; left++, right--) {
        const key = keys[left];
        const entity = entities[left];
        keys[left] = keys[right];
        entities[left] = entities[right];
        keys[right] = key;
        entities[right] = entity;
      }
    } else {
      while (end < length && keys[end] >= keys[end - 1]) end++;
    }

    // Short insertion runs bound the shifts before linear merging takes over.
    const limit = Math.min(start + 8, length);
    for (; end < limit; end++) {
      const key = keys[end];
      const entity = entities[end];
      let left = start;
      let right = end;
      while (left < right) {
        const middle = (left + right) >>> 1;
        if (key < keys[middle]) right = middle;
        else left = middle + 1;
      }
      for (let i = end; i > left; i--) {
        keys[i] = keys[i - 1];
        entities[i] = entities[i - 1];
      }
      keys[left] = key;
      entities[left] = entity;
    }
    start = end;
  }
  runs[count] = length;

  while (count > 1) {
    let next = 0;
    for (let run = 0; run < count; run += 2) {
      const start = runs[run];
      const middle = runs[run + 1];
      const end = run + 1 < count ? runs[run + 2] : middle;
      runs[next++] = start;
      let left = start;
      let right = middle;
      let output = start;
      if (left < middle && right < end) {
        let leftKey = keys[left];
        let rightKey = keys[right];
        while (true) {
          if (leftKey <= rightKey) {
            scratchKeys[output] = leftKey;
            scratchEntities[output++] = entities[left++];
            if (left === middle) break;
            leftKey = keys[left];
          } else {
            scratchKeys[output] = rightKey;
            scratchEntities[output++] = entities[right++];
            if (right === end) break;
            rightKey = keys[right];
          }
        }
      }
      while (left < middle) {
        scratchKeys[output] = keys[left];
        scratchEntities[output++] = entities[left++];
      }
      while (right < end) {
        scratchKeys[output] = keys[right];
        scratchEntities[output++] = entities[right++];
      }
    }
    runs[next] = length;
    count = next;
    const previousKeys = keys;
    keys = scratchKeys;
    scratchKeys = previousKeys;
    const previousEntities = entities;
    entities = scratchEntities;
    scratchEntities = previousEntities;
  }
  return entities;
}
