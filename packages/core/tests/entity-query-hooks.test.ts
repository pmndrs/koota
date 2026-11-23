import { describe, expect, it } from 'vitest';
import { createQuery, createWorld, machine, relation, trait, type Entity } from '../src';

describe('entity.onEnter and entity.onExit', () => {
  const Position = trait({ x: 0 });
  const Active = trait();
  const ChildOf = relation();

  it('fires for the observed entity only', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const entered: Entity[] = [];
    const exited: Entity[] = [];
    a.onEnter([Position], (entity) => entered.push(entity));
    a.onExit(createQuery(Position), (entity) => exited.push(entity));

    b.add(Position);
    a.add(Position);
    b.remove(Position);
    a.remove(Position);

    expect(entered).toEqual([a]);
    expect(exited).toEqual([a]);
  });

  it('follows a target entering and leaving a relation filter', () => {
    const world = createWorld();
    const parent = world.spawn();
    const other = world.spawn();
    const child = world.spawn(ChildOf(parent));
    const stranger = world.spawn(ChildOf(other));
    const events: string[] = [];
    child.onEnter([ChildOf(Active)], () => events.push('enter'));
    child.onExit([ChildOf(Active)], () => events.push('exit'));
    stranger.onEnter([ChildOf(Active)], () => events.push('stranger'));

    parent.add(Active);
    expect(child.has(ChildOf(Active))).toBe(true);
    parent.remove(Active);
    parent.add(Active);
    child.remove(ChildOf(parent));

    expect(events).toEqual(['enter', 'exit', 'enter', 'exit']);
  });

  it('stops after unsubscribing and after the entity is destroyed', () => {
    const world = createWorld();
    const entity = world.spawn();
    let enters = 0;
    let exits = 0;
    const unsubscribe = entity.onEnter([Position], () => enters++);
    entity.onExit([Position], () => exits++);

    entity.add(Position);
    unsubscribe();
    entity.remove(Position);
    entity.add(Position);
    entity.destroy();

    expect(enters).toBe(1);
    expect(exits).toBe(2);
    expect(world.spawn().onEnter([Position], () => {})).toBeTypeOf('function');
  });

  it('registers nothing for a dead entity', () => {
    const world = createWorld();
    const entity = world.spawn();
    entity.destroy();
    let enters = 0;
    entity.onEnter([Position], () => enters++);
    world.spawn(Position);
    expect(enters).toBe(0);
  });

  it('reports a machine transition once it has settled', () => {
    const Idle = trait();
    const Loading = trait();
    const Download = machine({ states: { Idle, Loading }, initial: Idle });
    const world = createWorld();
    const entity = world.spawn(Download);
    const other = world.spawn(Download);
    const events: string[] = [];
    entity.onEnter([Loading], () => events.push('enter'));
    entity.onExit([Idle], () => events.push('exit'));

    Download.enter(other, Loading);
    Download.enter(entity, Loading);

    expect(events.sort()).toEqual(['enter', 'exit']);
  });
});
