import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, getStore, relation, trait, type World } from '../src';

describe('Assertions', () => {
  let world: World;
  const Position = trait({ x: 0 });
  const Selected = trait();
  const Link = relation({ store: { weight: 0 }, exclusive: true });

  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    world.destroy();
  });

  it.each(['get', 'has', 'targetFor', 'targetsFor'] as const)(
    'rejects %s through a stale handle while keeping liveness probes safe',
    (operation) => {
      const target = world.spawn();
      const stale = world.spawn(Position, Link(target));
      stale.destroy();
      const replacement = world.spawn(Position({ x: 7 }), Link(target));
      expect(replacement.id()).toBe(stale.id());
      expect(stale.isAlive()).toBe(false);
      expect(world.has(stale)).toBe(false);
      expect(() => {
        if (operation === 'get') stale.get(Position);
        else if (operation === 'has') stale.has(Position);
        else if (operation === 'targetFor') stale.targetFor(Link);
        else stale.targetsFor(Link);
      }).toThrow(/\[ENTITY_ALIVE\]/);
      expect(replacement.get(Position)).toEqual({ x: 7 });
    }
  );

  it('keeps handles invalid after a world reset reuses their page', () => {
    const stale = world.spawn(Position);
    world.reset();
    const replacement = world.spawn(Position({ x: 7 }));
    expect(replacement.id()).toBe(stale.id());
    expect(stale.isAlive()).toBe(false);
    expect(world.has(stale)).toBe(false);
    expect(() => stale.set(Position, { x: 99 })).toThrow(/\[ENTITY_ALIVE\]/);
    expect(replacement.get(Position)).toEqual({ x: 7 });
  });

  it('does not revive a destroyed handle when its generation wraps', () => {
    const stale = world.spawn(Position);
    let current = stale;
    for (let i = 0; i < 256; i++) {
      expect(world.has(current)).toBe(true);
      expect(current.isAlive()).toBe(true);
      expect(current.get(Position)).toEqual({ x: i });
      current.destroy();
      if (i < 255) current = world.spawn(Position({ x: i + 1 }));
    }
    expect(world.has(stale)).toBe(false);
    expect(stale.isAlive()).toBe(false);
    expect(() => stale.get(Position)).toThrow(/\[ENTITY_ALIVE\]/);
    const replacement = world.spawn(Position({ x: 7 }));
    expect(world.has(replacement)).toBe(true);
    expect(replacement.get(Position)).toEqual({ x: 7 });
  });

  it('rejects changed on a missing trait without publishing a change', () => {
    const entity = world.spawn();
    const callback = vi.fn();
    world.onChange(Position, callback);
    expect(() => entity.changed(Position)).toThrow(/\[TRAIT_PRESENT\]/);
    expect(callback).not.toHaveBeenCalled();
    expect(entity.get(Position)).toBeUndefined();
    expect(entity.has(Position)).toBe(false);
  });

  it('rejects writeback when a set callback removes its trait', () => {
    const entity = world.spawn(Position({ x: 1 }));
    const callback = vi.fn();
    entity.onChange(Position, callback);
    expect(() =>
      entity.set(Position, () => {
        entity.remove(Position);
        return { x: 99 };
      })
    ).toThrow(/\[TRAIT_PRESENT\]/);
    const store = getStore(world, Position);
    expect(store.x[entity.id() >>> 10][entity.id() & 1023]).toBe(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects writeback when a set callback recycles its entity', () => {
    const entity = world.spawn(Position);
    let replacement = entity;
    expect(() =>
      entity.set(Position, () => {
        entity.destroy();
        replacement = world.spawn(Position({ x: 7 }));
        return { x: 99 };
      })
    ).toThrow(/\[ENTITY_ALIVE\]/);
    expect(replacement.get(Position)).toEqual({ x: 7 });
  });

  it('allows writeback after a callback changes unrelated entity structure', () => {
    const other = world.spawn();
    const entity = world.spawn(Position({ x: 1 }));
    entity.set(Position, (previous) => {
      other.destroy();
      world.spawn(Selected);
      return { x: previous.x + 1 };
    });
    expect(other.isAlive()).toBe(false);
    expect(entity.isAlive()).toBe(true);
    expect(entity.get(Position)).toEqual({ x: 2 });
    expect(world.query(Selected).length).toBe(1);
  });

  it.each(['dead', 'recycled', 'other-world'] as const)(
    'rejects a %s relation target before replacing an exclusive pair',
    (kind) => {
      const otherWorld = createWorld();
      try {
        const valid = world.spawn();
        const source = world.spawn(Link(valid, { weight: 7 }));
        const invalid = kind === 'other-world' ? otherWorld.spawn() : world.spawn();
        if (kind !== 'other-world') invalid.destroy();
        if (kind === 'recycled') world.spawn();
        const callback = vi.fn();
        source.onRemove(Link, callback);
        expect(() => source.add(Link(invalid))).toThrow(
          kind === 'other-world' ? /\[RELATION_WORLD\]/ : /\[ENTITY_ALIVE\]/
        );
        const update = vi.fn(() => ({ weight: 99 }));
        expect(() => source.set(Link(invalid), update)).toThrow(
          kind === 'other-world' ? /\[RELATION_WORLD\]/ : /\[ENTITY_ALIVE\]/
        );
        expect(update).not.toHaveBeenCalled();
        expect(source.targetFor(Link)).toBe(valid);
        expect(source.get(Link(valid))).toEqual({ weight: 7 });
        expect(callback).not.toHaveBeenCalled();
      } finally {
        otherWorld.destroy();
      }
    }
  );

  it.each(['wildcard', 'query'] as const)('rejects writes to a relation %s filter', (kind) => {
    const source = world.spawn();
    const pair = kind === 'wildcard' ? Link('*') : Link(Position);
    expect(() => source.add(pair)).toThrow(/\[RELATION_TARGET\]/);
    expect(() => source.set(pair, { weight: 1 })).toThrow(/\[RELATION_TARGET\]/);
    expect(source.targetsFor(Link)).toEqual([]);
  });

  it('requires an existing relation pair before invoking a set callback', () => {
    const target = world.spawn();
    const source = world.spawn();
    const callback = vi.fn(() => ({ weight: 99 }));
    expect(() => source.set(Link(target), callback)).toThrow(/\[RELATION_PRESENT\]/);
    source.add(Link(target));
    source.remove(Link(target));
    expect(() => source.set(Link(target), callback)).toThrow(/\[RELATION_PRESENT\]/);
    expect(callback).not.toHaveBeenCalled();
    expect(source.has(Link(target))).toBe(false);
  });

  it('supports relation set callbacks and rejects a pair removed inside one', () => {
    const target = world.spawn();
    const source = world.spawn(Link(target, { weight: 7 }));
    source.set(Link(target), (prev) => ({ weight: prev.weight + 1 }));
    expect(source.get(Link(target))).toEqual({ weight: 8 });
    const callback = vi.fn();
    source.onChange(Link, callback);
    expect(() =>
      source.set(Link(target), () => {
        source.remove(Link(target));
        return { weight: 99 };
      })
    ).toThrow(/\[RELATION_PRESENT\]/);
    expect(source.has(Link(target))).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects writeback when a callback replaces its exclusive relation pair', () => {
    const first = world.spawn();
    const second = world.spawn();
    const source = world.spawn(Link(first, { weight: 7 }));
    const changed = vi.fn();
    source.onChange(Link, changed);
    expect(() =>
      source.set(Link(first), () => {
        source.add(Link(second, { weight: 9 }));
        return { weight: 99 };
      })
    ).toThrow(/\[RELATION_PRESENT\]/);
    expect(source.targetFor(Link)).toBe(second);
    expect(source.get(Link(second))).toEqual({ weight: 9 });
    expect(changed).not.toHaveBeenCalled();
  });

  it('writes the selected relation pair when a callback removes another target', () => {
    const Links = relation({ store: { weight: 0 } });
    const first = world.spawn();
    const second = world.spawn();
    const source = world.spawn(Links(first, { weight: 1 }), Links(second, { weight: 7 }));
    source.set(Links(second), (prev) => {
      source.remove(Links(first));
      return { weight: prev.weight + 1 };
    });
    expect(source.targetsFor(Links)).toEqual([second]);
    expect(source.get(Links(second))).toEqual({ weight: 8 });
    expect(source.has(Links(first))).toBe(false);
  });

  it('keeps relation targets and query membership consistent through removal and reuse', () => {
    const target = world.spawn();
    const source = world.spawn(Link(target));
    source.add(Link(target));
    expect(source.targetsFor(Link)).toEqual([target]);
    expect([...world.query(Link(target))]).toEqual([source]);
    source.remove(Link('*'));
    expect(world.query(Link('*')).length).toBe(0);
    source.add(Link(target));
    target.destroy();
    const replacement = world.spawn();
    expect(replacement.id()).toBe(target.id());
    expect(source.targetsFor(Link)).toEqual([]);
    expect(world.query(Link(replacement)).length).toBe(0);
  });
});
