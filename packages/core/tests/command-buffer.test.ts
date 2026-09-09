import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld, getStore, relation, trait, type World } from '../src';

describe('Command buffers', () => {
  const worlds: World[] = [];
  const create = () => {
    const world = createWorld();
    worlds.push(world);
    return world;
  };
  afterEach(() => {
    for (const world of worlds) world.destroy();
    worlds.length = 0;
  });

  it('records sequential additions and applies them through the immediate lifecycle', () => {
    for (const deferred of [false, true]) {
      const world = create();
      const observations: string[] = [];
      const Velocity = trait({ x: 0 });
      const Position = trait(
        { x: 0 },
        {
          onAdd(value, entity) {
            observations.push(`hook:${value.x}:${entity.has(Velocity)}`);
            value.x++;
          },
        }
      );
      world.onAdd(Position, (entity) => observations.push(`observer:${entity.get(Position)!.x}`));
      world.onAdd(Velocity, () => observations.push('velocity'));
      if (deferred) {
        const commands = world.createCommandBuffer();
        commands.add(Position({ x: 3 }), Velocity);
        expect(commands.size).toBe(2);
        expect(world.has(Position)).toBe(false);
        expect(observations).toEqual([]);
        world.flush(commands);
        expect(commands.size).toBe(0);
      } else world.add(Position({ x: 3 }), Velocity);
      expect(observations).toEqual(['hook:3:false', 'observer:4', 'velocity']);
      expect(world.get(Position)).toEqual({ x: 4 });
    }
  });

  it('reserves invisible entities that later commands and relations can reference', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const ChildOf = relation();
    const spawned = vi.fn();
    world.onEntitySpawn(spawned);
    const commands = world.createCommandBuffer();
    const parent = commands.spawn(Position({ x: 1 }));
    const child = commands.spawn(Position);
    commands.add(child, ChildOf(parent));
    commands.set(child, Position, { x: 2 });
    expect(world.traits.has(Position)).toBe(false);
    expect(world.has(parent)).toBe(false);
    expect(parent.isAlive()).toBe(false);
    expect(world.entities).not.toContain(parent);
    expect(world.query(Position)).toHaveLength(0);
    expect(spawned).not.toHaveBeenCalled();
    world.flush(commands);
    expect(parent.isAlive()).toBe(true);
    expect(child.get(Position)).toEqual({ x: 2 });
    expect(child.has(ChildOf(parent))).toBe(true);
    expect(spawned).toHaveBeenCalledTimes(2);
  });

  it('preserves caller buffer order and supports reuse', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const entity = world.spawn(Position);
    const first = world.createCommandBuffer();
    const second = world.createCommandBuffer();
    first.set(entity, Position, { x: 1 });
    second.set(entity, Position, ({ x }) => ({ x: x + 2 }));
    world.flush(first, second);
    expect(entity.get(Position)).toEqual({ x: 3 });
    first.set(entity, Position, { x: 5 });
    world.flush(first);
    world.flush(first);
    expect(entity.get(Position)).toEqual({ x: 5 });
  });

  it('captures scalar fields at recording time', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const commands = world.createCommandBuffer();
    const initial = { x: 1 };
    const entity = commands.spawn(Position(initial));
    initial.x = 10;
    const next = { x: 2 };
    commands.set(entity, Position, next);
    next.x = 20;
    world.flush(commands);
    expect(entity.get(Position)).toEqual({ x: 2 });
  });

  it('supports world shorthand setters and removals through the recording facade', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const Tag = trait();
    const changed = vi.fn();
    world.onChange(Position, changed);
    const commands = world.createCommandBuffer();
    commands.add(Position, Tag);
    commands.set(Position, { x: 2 }, false);
    commands.remove(Tag);
    world.flush(commands);
    expect(world.get(Position)).toEqual({ x: 2 });
    expect(world.has(Tag)).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    commands.set(Position, ({ x }) => ({ x: x + 1 }));
    world.flush(commands);
    expect(world.get(Position)).toEqual({ x: 3 });
    expect(changed).toHaveBeenCalledOnce();
  });

  it('discards work and releases reservations when cleared', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const commands = world.createCommandBuffer();
    const discarded = commands.spawn(Position);
    commands.clear();
    world.flush(commands);
    expect(world.query()).not.toContain(discarded);
    const replacement = world.spawn(Position);
    expect(discarded.isAlive()).toBe(false);
    expect(replacement).not.toBe(discarded);
    expect([...world.query(Position)]).toEqual([replacement]);
  });

  it('recycles destroyed slots for subsequent deferred spawns', () => {
    const world = create();
    const commands = world.createCommandBuffer();
    const first = commands.spawn();
    world.flush(commands);
    commands.destroy(first);
    world.flush(commands);
    const next = commands.spawn();
    expect(next.id()).toBe(first.id());
    expect(next.isAlive()).toBe(false);
    world.flush(commands);
    expect(next.isAlive()).toBe(true);
    expect(first.isAlive()).toBe(false);
  });

  it('keeps reserved identities distinct when immediate and deferred spawns share recycled slots', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const first = world.spawn();
    const second = world.spawn();
    first.destroy();
    second.destroy();
    const commands = world.createCommandBuffer();
    const reserved = commands.spawn(Position({ x: 1 }));
    const immediate = world.spawn(Position({ x: 2 }));
    const another = commands.spawn(Position({ x: 3 }));
    expect(new Set([reserved.id(), immediate.id(), another.id()]).size).toBe(3);
    expect([...world.query(Position)]).toEqual([immediate]);
    world.flush(commands);
    expect(world.query(Position)).toHaveLength(3);
    expect(reserved.get(Position)).toEqual({ x: 1 });
    expect(immediate.get(Position)).toEqual({ x: 2 });
    expect(another.get(Position)).toEqual({ x: 3 });
  });

  it('rejects foreign and expired buffers before playing any commands', () => {
    const world = create();
    const other = create();
    const Position = trait({ x: 0 });
    const commands = world.createCommandBuffer();
    commands.add(Position);
    const foreign = other.createCommandBuffer();
    expect(() => world.flush(commands, foreign)).toThrow(
      expect.objectContaining({
        message: "Koota: Cannot flush another world's command buffer.",
        cause: expect.objectContaining({ code: 'BUFFER_CONTEXT_MISMATCH' }),
      })
    );
    expect(world.has(Position)).toBe(false);
    world.reset();
    expect(() => world.flush(commands)).toThrow('reset or destroyed');
    expect(() => commands.add(Position)).toThrow(
      'Koota: Command buffer belongs to a reset or destroyed world.'
    );
  });

  it.each([
    new Error('Application hook failed'),
    Object.assign(new Error('Application error with its own code'), {
      code: 'BUFFER_CONTEXT_EXPIRED',
    }),
    { message: 'Application failure', code: 'BUFFER_CONTEXT_MISMATCH' },
  ])('preserves exceptions thrown by hooks during playback: %s', (failure) => {
    const world = create();
    const Failing = trait(undefined, {
      onAdd() {
        throw failure;
      },
    });
    const commands = world.createCommandBuffer();
    commands.spawn(Failing);
    let caught: unknown;
    try {
      world.flush(commands);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(() => world.spawn()).not.toThrow();
  });

  it('does not apply stale entity commands to a recycled identity', () => {
    const world = create();
    const Position = trait({ x: 0 });
    const original = world.spawn(Position);
    const commands = world.createCommandBuffer();
    commands.set(original, Position, { x: 5 });
    commands.destroy(original);
    original.destroy();
    const replacement = world.spawn(Position);
    expect(replacement.id()).toBe(original.id());
    world.flush(commands);
    expect(replacement.isAlive()).toBe(true);
    expect(replacement.get(Position)).toEqual({ x: 0 });
  });

  it('invalidates reserved handles across reset and can queue callback work again', () => {
    const world = create();
    const B = trait();
    const A = trait(undefined, {
      onAdd(_value, entity) {
        entity.add(B);
      },
    });
    world.add(A);
    const commands = world.createCommandBuffer();
    const reserved = commands.spawn(A);
    world.reset();
    const replacement = world.spawn(A);
    expect(reserved.isAlive()).toBe(false);
    expect(replacement.has(B)).toBe(true);
  });

  it('rejects duplicate buffers without replaying partial work', () => {
    const world = create();
    const A = trait();
    const commands = world.createCommandBuffer();
    const entity = commands.spawn(A);
    expect(() => world.flush(commands, commands)).toThrow('same command buffer twice');
    expect(entity.isAlive()).toBe(false);
    world.flush(commands);
    expect(entity.has(A)).toBe(true);
  });

  it('drains callback commands after the supplied buffers without recursive mutation', () => {
    const world = create();
    const order: string[] = [];
    const C = trait();
    const B = trait();
    const A = trait(undefined, {
      onAdd(_value, entity) {
        order.push('a');
        entity.add(C);
        expect(entity.has(C)).toBe(false);
      },
    });
    world.onAdd(B, () => order.push('b'));
    world.onAdd(C, () => order.push('c'));
    const commands = world.createCommandBuffer();
    commands.add(A, B);
    world.flush(commands);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(world.has(C)).toBe(true);
  });

  it('applies remove and destroy lifecycles, including relation cascades', () => {
    const world = create();
    const removed = vi.fn();
    const Position = trait({ x: 0 }, { onRemove: removed });
    const ChildOf = relation({ autoDestroy: 'source' });
    const parent = world.spawn(Position);
    const children = Array.from({ length: 3 }, () => world.spawn(Position, ChildOf(parent)));
    const commands = world.createCommandBuffer();
    commands.remove(parent, Position);
    commands.destroy(parent);
    world.flush(commands);
    expect(removed).toHaveBeenCalledTimes(4);
    expect(children.every((entity) => !entity.isAlive())).toBe(true);
  });

  it('publishes raw writes only when a changed command is flushed', () => {
    const world = create();
    const changed = vi.fn();
    const Position = trait({ x: 0 }, { onSet: changed });
    const entity = world.spawn(Position);
    getStore(world, Position).x[entity.id() >>> 10][entity.id() & 1023] = 5;
    const commands = world.createCommandBuffer();
    commands.changed(entity, Position);
    expect(changed).not.toHaveBeenCalled();
    world.flush(commands);
    expect(changed).toHaveBeenCalledOnce();
    expect(entity.get(Position)).toEqual({ x: 5 });
  });

  it('leaves the world usable after a failing hook and discards remaining commands', () => {
    const world = create();
    const Tag = trait();
    const Broken = trait(undefined, {
      onAdd() {
        throw new Error('hook failed');
      },
    });
    const commands = world.createCommandBuffer();
    commands.add(Broken);
    const discarded = commands.spawn(Tag);
    expect(() => world.flush(commands)).toThrow('hook failed');
    expect(commands.size).toBe(0);
    expect(discarded.isAlive()).toBe(false);
    world.add(Tag);
    expect(world.has(Tag)).toBe(true);
  });
});
