import { describe, expect, it } from 'vitest';
import {
  alive,
  attach,
  collect,
  createEntityKernel,
  destroy,
  detach,
  has,
  pair,
  readInto,
  spawn,
  writeFrom,
  type EntityKernel,
} from '../src/kernel/experimental/entity-kernel';

function read(kernel: EntityKernel, entity: number, trait: number): number | undefined {
  const output = new Float64Array(1);
  return readInto(kernel, entity, trait, output) ? output[0] : undefined;
}

describe.each(['packed', 'typed'] as const)('Entity model with %s storage', (storage) => {
  it('uses the same identities for subjects, traits, relations, and pairs', () => {
    const kernel = createEntityKernel(32, 32, storage);
    const Position = spawn(kernel);
    const Serializable = spawn(kernel);
    const ChildOf = spawn(kernel);
    const parent = spawn(kernel);
    const child = spawn(kernel);
    const childOfParent = pair(kernel, ChildOf, parent);
    expect(pair(kernel, ChildOf, parent)).toBe(childOfParent);
    expect(attach(kernel, Position, Serializable)).toBe(1);
    expect(attach(kernel, ChildOf, Serializable)).toBe(1);
    expect(attach(kernel, childOfParent, Serializable)).toBe(1);
    expect(attach(kernel, child, childOfParent)).toBe(1);
    expect(attach(kernel, child, Position)).toBe(1);
    expect(writeFrom(kernel, child, Position, new Float64Array([42]))).toBe(true);
    expect(read(kernel, child, Position)).toBe(42);
    expect(has(kernel, child, childOfParent)).toBe(true);
    const output = new Uint32Array(32);
    expect(collect(kernel, [Serializable], output)).toBe(3);
    expect(Array.from(output.slice(0, 3)).sort()).toEqual([Position, ChildOf, childOfParent].sort());
    expect(collect(kernel, [Position, childOfParent], output)).toBe(1);
    expect(output[0]).toBe(child);
  });

  it('reports exact capacity without partially mutating failed operations', () => {
    const empty = createEntityKernel(0, 0, storage);
    expect(spawn(empty)).toBe(0);
    expect(collect(empty, [], [])).toBe(0);
    const kernel = createEntityKernel(3, 1, storage);
    const a = spawn(kernel);
    const b = spawn(kernel);
    const c = spawn(kernel);
    expect(spawn(kernel)).toBe(0);
    expect(pair(kernel, a, b)).toBe(0);
    expect(attach(kernel, a, b)).toBe(1);
    expect(writeFrom(kernel, a, b, new Float64Array([5]))).toBe(true);
    expect(attach(kernel, a, b)).toBe(0);
    expect(read(kernel, a, b)).toBe(5);
    expect(attach(kernel, c, b)).toBe(-1);
    expect(has(kernel, c, b)).toBe(false);
    expect(detach(kernel, a, b)).toBe(true);
    expect(attach(kernel, c, b)).toBe(1);
    const output = [99];
    expect(collect(kernel, [], output)).toBe(3);
    expect(output).toHaveLength(1);
    expect(collect(kernel, [b], [])).toBe(1);
  });

  it('removes a destroyed definition from its users and rejects stale identities', () => {
    const kernel = createEntityKernel(8, 16, storage);
    const trait = spawn(kernel);
    const first = spawn(kernel);
    const second = spawn(kernel);
    attach(kernel, first, trait);
    attach(kernel, second, trait);
    attach(kernel, trait, trait);
    expect(destroy(kernel, trait)).toBe(true);
    expect(destroy(kernel, trait)).toBe(false);
    expect(alive(kernel, first)).toBe(true);
    expect(has(kernel, first, trait)).toBe(false);
    const replacement = spawn(kernel);
    expect(replacement).not.toBe(trait);
    expect(alive(kernel, trait)).toBe(false);
    expect(attach(kernel, first, trait)).toBe(-2);
    expect(has(kernel, first, replacement)).toBe(false);
    expect(attach(kernel, first, replacement)).toBe(1);
    expect(collect(kernel, [replacement], new Uint32Array(8))).toBe(1);
  });

  it('cleans up nested pairs when a target or relation is destroyed', () => {
    const kernel = createEntityKernel(32, 32, storage);
    const relation = spawn(kernel);
    const target = spawn(kernel);
    const other = spawn(kernel);
    const subject = spawn(kernel);
    const first = pair(kernel, relation, target);
    const nested = pair(kernel, first, first);
    const independent = pair(kernel, relation, other);
    attach(kernel, subject, first);
    attach(kernel, subject, nested);
    attach(kernel, subject, independent);
    destroy(kernel, target);
    expect(alive(kernel, first)).toBe(false);
    expect(alive(kernel, nested)).toBe(false);
    expect(has(kernel, subject, independent)).toBe(true);
    expect(pair(kernel, relation, other)).toBe(independent);
    destroy(kernel, relation);
    expect(alive(kernel, independent)).toBe(false);
    expect(alive(kernel, subject)).toBe(true);
    expect(kernel.size).toBe(2);
  });

  it('keeps interned pairs reachable through deletion and reuse of hash clusters', () => {
    const kernel = createEntityKernel(512, 512, storage);
    const relation = spawn(kernel);
    const targets = Array.from({ length: 128 }, () => spawn(kernel));
    const pairs = targets.map((target) => pair(kernel, relation, target));
    for (let round = 0; round < 8; round++) {
      for (let i = round % 2; i < pairs.length; i += 2) {
        destroy(kernel, pairs[i]);
        pairs[i] = pair(kernel, relation, targets[i]);
      }
      for (let i = 0; i < pairs.length; i++) {
        expect(pair(kernel, relation, targets[i])).toBe(pairs[i]);
        expect(alive(kernel, pairs[i])).toBe(true);
      }
    }
    destroy(kernel, relation);
    expect(pairs.every((id) => !alive(kernel, id))).toBe(true);
    expect(kernel.size).toBe(128);
  });

  it('preserves numeric values and rejects noninteger or nonfinite handles', () => {
    const kernel = createEntityKernel(8, 8, storage);
    const trait = spawn(kernel);
    const entity = spawn(kernel);
    for (const invalid of [0, -1, NaN, Infinity, 1.5, 0x40000000]) {
      expect(alive(kernel, invalid)).toBe(false);
      expect(attach(kernel, invalid, trait)).toBe(-2);
      expect(collect(kernel, [invalid], [])).toBe(0);
    }
    expect(read(kernel, entity, trait)).toBeUndefined();
    attach(kernel, entity, trait);
    const input = new Float64Array(1);
    for (const value of [NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE]) {
      input[0] = value;
      expect(writeFrom(kernel, entity, trait, input)).toBe(true);
      expect(Object.is(read(kernel, entity, trait), value)).toBe(true);
    }
    const output = new Float64Array([42, 99]);
    expect(readInto(kernel, entity, trait, output, 1)).toBe(true);
    expect(output[0]).toBe(42);
    expect(output[1]).toBe(Number.MIN_VALUE);
    for (const offset of [-1, 2, 0.5, NaN]) {
      expect(readInto(kernel, entity, trait, output, offset)).toBe(false);
      expect(writeFrom(kernel, entity, trait, output, offset)).toBe(false);
    }
    expect(readInto(kernel, entity, trait, new Float64Array(0))).toBe(false);
    expect(output[0]).toBe(42);
  });

  it('retires exhausted generations without resurrecting an old handle', () => {
    const kernel = createEntityKernel(0xfffff, 0, storage);
    const first = spawn(kernel);
    let entity = first;
    for (let i = 0; i <= kernel.maxGeneration; i++) {
      expect(entity).toBeGreaterThan(0);
      expect(entity).toBeLessThan(0x40000000);
      destroy(kernel, entity);
      entity = spawn(kernel);
    }
    expect(entity % kernel.stride).not.toBe(first % kernel.stride);
    expect(alive(kernel, first)).toBe(false);
  });
});
