import { it } from 'node:test';
import assert from 'node:assert/strict';
import { collect, compile, createArchetypeGraph, spawn, toggle } from './archetype-graph';

it('preserves membership while pages empty, refill and move between archetypes', () => {
  const graph = createArchetypeGraph(4096, 3);
  const masks = new Uint32Array(4096);
  for (let i = 0; i < masks.length; i++) assert.equal(spawn(graph, 0), i);
  assert.equal(spawn(graph, 0), -1);
  const required = compile(graph, 3);
  const output = new Uint32Array(4096);
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < masks.length; i++) {
      const bit = (i + round) % 3;
      toggle(graph, i, bit);
      masks[i] ^= 1 << bit;
    }
    const expected = Array.from(masks.keys()).filter((i) => (masks[i] & 3) === 3);
    assert.deepEqual(
      Array.from(output.subarray(0, collect(graph, required, output))).sort((a, b) => a - b),
      expected
    );
  }
});
