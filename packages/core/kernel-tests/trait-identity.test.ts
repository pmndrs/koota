import { expect, expectTypeOf, it } from 'vitest';
import { $internal, createWorld, IsExcluded, trait, type Trait } from '../src';
import {
  addTrait,
  createTrait,
  getTrait,
  queryInternal,
  removeTrait,
  type Trait as KernelTrait,
} from '../src/kernel';

it('shares trait definitions and membership across the API and kernel', () => {
  expectTypeOf<Trait>().toEqualTypeOf<KernelTrait>();
  const world = createWorld();
  try {
    const Position = createTrait({ x: 0 });
    const Ready = trait();
    const entity = world.spawn(Position({ x: 2 }));
    const ctx = world[$internal].kernel;

    expect(getTrait(ctx, entity, Position)).toEqual({ x: 2 });
    addTrait(ctx, entity, Ready);
    expect([...world.query(Position, Ready)]).toEqual([entity]);
    entity.set(Position, { x: 3 });
    expect(getTrait(ctx, entity, Position)).toEqual({ x: 3 });
    removeTrait(ctx, entity, Ready);
    expect(entity.has(Ready)).toBe(false);

    addTrait(ctx, entity, IsExcluded);
    expect([...world.query(Position)]).toEqual([]);
    entity.remove(IsExcluded);
    expect(queryInternal(ctx, Position)).toEqual([entity]);
  } finally {
    world.destroy();
  }
});
