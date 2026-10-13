import { describe, expect, it } from 'vitest';
import { createWorld, trait } from '../src';

describe('each loops under mutation', () => {
  it('visit a result held past world destroy with undefined records', () => {
    for (const size of [5, 300]) {
      const Position = trait({ x: 0 });
      const world = createWorld();
      for (let i = 0; i < size; i++) world.spawn(Position({ x: i }));
      world.onChange(Position, () => {});
      const result = world.query(Position);
      world.destroy();

      const read: unknown[] = [];
      const updated: unknown[] = [];
      result.readEach(([position]) => read.push(position));
      expect(result.updateEach(([position]) => updated.push(position))).toBe(result);
      expect(updated).toEqual(read);
      expect(updated).toEqual(Array(size).fill(undefined));
      expect(() => result.updateEach(() => {}, { changeDetection: 'always' })).not.toThrow();
      expect(result.getPages()).toEqual([]);
    }
  });
});
