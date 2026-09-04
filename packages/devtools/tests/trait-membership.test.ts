import { $internal, createWorld, relation, trait } from '@koota/core';
import { describe, expect, it } from 'vitest';
import {
  hasTraitEntities,
  readTraitCounts,
  readTraitEntities,
  readTraitEntityCount,
} from '../src/devtools/model/trait-membership';

const Position = trait({ x: 0, y: 0 });
const IsPlayer = trait();
const ChildOf = relation({ exclusive: true });

describe('trait membership', () => {
  it('reads the same entities a query would', () => {
    const world = createWorld();
    const player = world.spawn(Position, IsPlayer);
    const rock = world.spawn(Position);
    world.spawn();
    const bullet = world.spawn(Position, ChildOf(player));

    expect(readTraitEntities(world, Position)).toEqual([...world.query(Position)]);
    expect(readTraitEntities(world, IsPlayer)).toEqual([player]);
    expect(readTraitEntities(world, ChildOf[$internal].trait)).toEqual([bullet]);
    expect(readTraitEntityCount(world, Position)).toBe(3);
    expect(hasTraitEntities(world, IsPlayer)).toBe(true);

    rock.destroy();
    player.remove(IsPlayer);
    expect(readTraitEntities(world, Position)).toEqual([...world.query(Position)]);
    expect(hasTraitEntities(world, IsPlayer)).toBe(false);
  });

  it('leaves the world entity out, like a query does', () => {
    const world = createWorld();
    world.add(IsPlayer);
    expect(readTraitEntities(world, IsPlayer)).toEqual([]);
    expect(readTraitCounts(world).get(IsPlayer)).toBe(0);
  });

  it('is empty for traits the world has never seen', () => {
    const world = createWorld();
    const Unused = trait();
    expect(readTraitEntities(world, Unused)).toEqual([]);
    expect(readTraitEntityCount(world, Unused)).toBe(0);
    expect(readTraitCounts(world).has(Unused)).toBe(false);
  });

  it('counts every trait in one pass, across mask generations', () => {
    const world = createWorld();
    // Enough traits to spill into a second 32 bit mask generation.
    const many = Array.from({ length: 40 }, () => trait());
    const entities = Array.from({ length: 50 }, (_, i) => world.spawn(...many.slice(0, i % 40)));
    entities[3].destroy();

    const counts = readTraitCounts(world);
    for (const t of many) {
      expect(counts.get(t) ?? 0).toBe(world.query(t).length);
    }
  });
});
