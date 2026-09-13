import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addTrait,
  addPair,
  Any,
  changed,
  added,
  collect,
  count,
  createEntity,
  createTracker,
  createWorld,
  defineTrait,
  defineRelation,
  destroyEntity,
  destroyWorld,
  entityGeneration,
  entityIndex,
  first,
  getTrait,
  getFirstTarget,
  getQueryVersion,
  getSources,
  getTargets,
  getTypeVersion,
  getValue,
  hasTrait,
  isAlive,
  markChanged,
  not,
  observe,
  or,
  pair,
  removeTrait,
  removed,
  removePair,
  resetWorld,
  resolveQuery,
  setTrait,
  setTraitHooks,
  setValue,
  subscribeQuery,
  targets,
  visitArchetypes,
  Wildcard,
  type Entity,
  type Term,
  type World,
} from '../index';

const worlds: World[] = [];
function world(options?: { exclude?: number[] }): World {
  const created = createWorld(options);
  worlds.push(created);
  return created;
}
afterEach(() => {
  for (const created of worlds) destroyWorld(created);
  worlds.length = 0;
});

function query(w: World, ...terms: Term[]): Entity[] {
  return collect(w, resolveQuery(w, terms));
}

const Position = defineTrait({ x: 0, y: 0 });
const Velocity = defineTrait({ x: 1, y: 1 });
const Name = defineTrait({ value: 'ball' });
const Tag = defineTrait();
const Other = defineTrait();
const Hidden = defineTrait();
const Counter = defineTrait({ value: () => ({ count: 0 }) });
const Instance = defineTrait(() => ({ hits: 0 }));

describe('entities', () => {
  it('creates, checks, and destroys entities with generations', () => {
    const w = world();
    const a = createEntity(w);
    const b = createEntity(w);
    expect(a).not.toBe(b);
    expect(isAlive(w, a)).toBe(true);
    expect(isAlive(w, 0)).toBe(false);
    expect(entityIndex(a)).toBe(1);
    destroyEntity(w, a);
    expect(isAlive(w, a)).toBe(false);
    const c = createEntity(w);
    expect(entityIndex(c)).toBe(entityIndex(a));
    expect(entityGeneration(c)).toBe(entityGeneration(a) + 1);
    expect(isAlive(w, a)).toBe(false);
    expect(isAlive(w, c)).toBe(true);
    expect(count(w, resolveQuery(w, []))).toBe(2);
  });

  it('applies entries in order and fires created after them', () => {
    const w = world();
    let hadPosition = false;
    observe(w, 'entityCreated', (entity) => {
      hadPosition = hasTrait(w, entity, Position);
    });
    const entity = createEntity(w, [Tag, [Position, { x: 3 }]]);
    expect(hadPosition).toBe(true);
    expect(getTrait(w, entity, Position)).toEqual({ x: 3, y: 0 });
    expect(hasTrait(w, entity, Tag)).toBe(true);
  });

  it('fires destroying before traits leave and destroyed after', () => {
    const w = world();
    const order: string[] = [];
    observe(w, 'entityDestroying', (entity) => {
      order.push(`destroying:${hasTrait(w, entity, Position)}`);
    });
    observe(w, 'traitRemoving', (type, entity) => {
      order.push(`removing:${type === Position}:${getTrait(w, entity, Position) !== undefined}`);
    });
    observe(w, 'entityDestroyed', (entity) => order.push(`destroyed:${isAlive(w, entity)}`));
    const entity = createEntity(w, [Position]);
    destroyEntity(w, entity);
    expect(order).toEqual(['destroying:true', 'removing:true:true', 'destroyed:false']);
  });
});

describe('traits', () => {
  it('adds with defaults, factories, and initial values', () => {
    const w = world();
    const entity = createEntity(w);

    expect(addTrait(w, entity, Position, { x: 5 })).toBe(true);
    expect(addTrait(w, entity, Position, { x: 9 })).toBe(false);
    expect(getTrait(w, entity, Position)).toEqual({ x: 5, y: 0 });

    addTrait(w, entity, Counter);
    const counter = getTrait(w, entity, Counter) as { value: { count: number } };
    expect(counter.value).toEqual({ count: 0 });
    const other = createEntity(w, [Counter]);
    expect((getTrait(w, other, Counter) as { value: object }).value).not.toBe(counter.value);
    
    addTrait(w, entity, Instance);
    expect(getTrait(w, entity, Instance)).toEqual({ hits: 0 });
    expect(getTrait(w, entity, Tag)).toBeUndefined();
    expect(getTrait(w, entity, Velocity)).toBeUndefined();
  });

  it('sets partial records, callbacks, and values', () => {
    const w = world();
    const entity = createEntity(w, [Position]);

    setTrait(w, entity, Position, { y: 4 });
    expect(getTrait(w, entity, Position)).toEqual({ x: 0, y: 4 });

    setTrait(w, entity, Position, (previous: { x: number; y: number }) => ({ x: previous.y * 2 }));
    expect(getValue(w, entity, Position, 'x')).toBe(8);

    setValue(w, entity, Position, 'y', 1);
    expect(getTrait(w, entity, Position)).toEqual({ x: 8, y: 1 });
    expect(setTrait(w, entity, Velocity, { x: 1 })).toBe(false);

    const object = createEntity(w, [Instance]);
    setTrait(w, object, Instance, { hits: 3 });
    expect(getTrait(w, object, Instance)).toEqual({ hits: 3 });
  });

  it('removes and keeps other data intact', () => {
    const w = world();
    const entity = createEntity(w, [[Position, { x: 2 }], Velocity, Name]);
    const other = createEntity(w, [[Position, { x: 7 }], Velocity, Name]);

    expect(removeTrait(w, entity, Velocity)).toBe(true);
    expect(removeTrait(w, entity, Velocity)).toBe(false);
    expect(hasTrait(w, entity, Velocity)).toBe(false);

    expect(getTrait(w, entity, Position)).toEqual({ x: 2, y: 0 });
    expect(getTrait(w, other, Position)).toEqual({ x: 7, y: 0 });
    expect(getTrait(w, other, Name)).toEqual({ value: 'ball' });

    destroyEntity(w, other);
    expect(getTrait(w, entity, Name)).toEqual({ value: 'ball' });
  });

  it('fires trait observers in lifecycle order', () => {
    const w = world();
    const order: string[] = [];

    observe(w, 'traitAdded', (type, entity) => {
      if (type === Position) order.push(`added:${JSON.stringify(getTrait(w, entity, Position))}`);
    });
    observe(w, 'traitChanged', (type) => order.push(`changed:${type === Position}`));
    observe(w, 'traitRemoving', (type, entity) => {
      if (type === Position) order.push(`removing:${hasTrait(w, entity, Position)}`);
    });

    const entity = createEntity(w, [[Position, { x: 1 }]]);
    setTrait(w, entity, Position, { x: 2 });
    setTrait(w, entity, Position, { x: 3 }, false);
    markChanged(w, entity, Position);
    removeTrait(w, entity, Position);

    // A value supplied at creation is applied before the add publishes, and its change publishes after.
    expect(order).toEqual(['added:{"x":1,"y":0}', 'changed:true', 'changed:true', 'changed:true', 'removing:true']);
  });

  it('bumps type versions on every write', () => {
    const w = world();
    const entity = createEntity(w, [Position]);
    const initial = getTypeVersion(w, Position);
    setTrait(w, entity, Position, { x: 1 }, false);
    
    expect(getTypeVersion(w, Position)).toBeGreaterThan(initial);
    expect(getTypeVersion(w, Velocity)).toBe(0);
  });
});

describe('queries', () => {
  it('matches required, forbidden, alternative, and empty terms', () => {
    const w = world();
    const a = createEntity(w, [Position, Velocity]);
    const b = createEntity(w, [Position]);
    const c = createEntity(w, [Position, Velocity, Tag]);
    const d = createEntity(w);
    expect(query(w, Position, Velocity)).toEqual([a, c]);
    expect(query(w, Position, not(Velocity))).toEqual([b]);
    expect(query(w, Position, not(Velocity), not(Tag))).toEqual([b]);
    expect(query(w, or(Tag, Velocity))).toEqual([a, c]);
    expect(new Set(query(w))).toEqual(new Set([a, b, c, d]));
    expect(new Set(query(w, not(Tag)))).toEqual(new Set([a, b, d]));
    expect(query(w, Velocity, or(Tag, Other))).toEqual([c]);
  });

  it('shares cached queries regardless of term order and stays live', () => {
    const w = world();
    const one = resolveQuery(w, [Position, not(Tag)]);
    const two = resolveQuery(w, [not(Tag), Position]);
    expect(one).toBe(two);
    const entity = createEntity(w, [Position]);
    expect(collect(w, one)).toEqual([entity]);
    addTrait(w, entity, Tag);
    expect(collect(w, one)).toEqual([]);
    expect(first(w, resolveQuery(w, [Position]))).toBe(entity);
  });

  it('applies world exclusions to every query', () => {
    const w = world({ exclude: [Hidden] });
    const visible = createEntity(w, [Position]);
    createEntity(w, [Position, Hidden]);
    expect(query(w, Position)).toEqual([visible]);
    expect(query(w)).toEqual([visible]);
  });

  it('visits live archetypes for static queries', () => {
    const w = world();
    createEntity(w, [[Position, { x: 1 }], Velocity]);
    createEntity(w, [[Position, { x: 2 }]]);
    createEntity(w, [[Position, { x: 3 }], Tag]);
    let sum = 0;
    let visited = 0;
    visitArchetypes(w, resolveQuery(w, [Position]), (archetype) => {
      visited++;
      const [x] = archetype.records.get(Position)!.columns!;
      for (let i = 0; i < archetype.entities.length; i++) sum += x[i] as number;
    });
    expect(sum).toBe(6);
    expect(visited).toBe(3);
  });

  it('reports versions and membership events only for observed queries', () => {
    const w = world();
    const q = resolveQuery(w, [Position, Velocity]);
    const version = getQueryVersion(w, q);
    const added = vi.fn();
    const removedCb = vi.fn();
    subscribeQuery(w, q, 'add', added);
    subscribeQuery(w, q, 'remove', removedCb);
    const entity = createEntity(w, [Position]);
    expect(added).not.toHaveBeenCalled();
    addTrait(w, entity, Velocity);
    expect(added).toHaveBeenCalledExactlyOnceWith(entity);
    expect(getQueryVersion(w, q)).toBeGreaterThan(version);
    removeTrait(w, entity, Position);
    expect(removedCb).toHaveBeenCalledExactlyOnceWith(entity);
    addTrait(w, entity, Position);
    destroyEntity(w, entity);
    expect(removedCb).toHaveBeenCalledTimes(2);
  });
});

describe('relations', () => {
  const ChildOf = defineRelation();
  const Likes = defineRelation();
  const Fears = defineRelation();
  const Parent = defineRelation({ exclusive: true });
  const Owns = defineRelation({ autoDestroy: 'source' });
  const Contains = defineRelation({ autoDestroy: 'target' });
  const Weighted = defineRelation({ schema: { amount: 0 } });

  it('holds several targets and answers wildcard and reverse lookups', () => {
    const w = world();
    const player = createEntity(w);
    const guard = createEntity(w);
    const goblin = createEntity(w, [pair(Likes, player), pair(Fears, guard), pair(Likes, guard)]);
    expect(new Set(getTargets(w, goblin, Likes))).toEqual(new Set([player, guard]));
    expect(getTargets(w, goblin, Fears)).toEqual([guard]);
    expect(hasTrait(w, goblin, pair(Likes, Any))).toBe(true);
    expect(hasTrait(w, goblin, pair(Wildcard, guard))).toBe(true);
    expect(query(w, pair(Likes, Any))).toEqual([goblin]);
    expect(query(w, pair(Likes, guard))).toEqual([goblin]);
    expect(getSources(w, Likes, guard)).toEqual([goblin]);
    expect(getSources(w, Wildcard, guard)).toEqual([goblin]);
  });

  it('keeps aggregates while siblings remain and drops them with the last pair', () => {
    const w = world();
    const person = createEntity(w);
    const dragon = createEntity(w);
    const other = createEntity(w);
    addPair(w, person, Likes, dragon);
    addPair(w, person, Fears, dragon);
    addPair(w, person, Likes, other);
    removePair(w, person, Likes, dragon);
    expect(hasTrait(w, person, pair(Fears, dragon))).toBe(true);
    expect(hasTrait(w, person, pair(Wildcard, dragon))).toBe(true);
    expect(hasTrait(w, person, pair(Likes, Any))).toBe(true);
    removePair(w, person, Likes, other);
    expect(hasTrait(w, person, pair(Likes, Any))).toBe(false);
    removePair(w, person, Fears, dragon);
    expect(hasTrait(w, person, pair(Wildcard, dragon))).toBe(false);
    expect(getTargets(w, person, Likes)).toEqual([]);
  });

  it('removes every pair of a relation with the wildcard target', () => {
    const w = world();
    const person = createEntity(w);
    const apple = createEntity(w);
    const banana = createEntity(w);
    addPair(w, person, Likes, apple);
    addPair(w, person, Likes, banana);
    expect(removePair(w, person, Likes, Any)).toBe(true);
    expect(hasTrait(w, person, pair(Likes, apple))).toBe(false);
    expect(hasTrait(w, person, pair(Likes, Any))).toBe(false);
  });

  it('replaces exclusive targets in one transition with removal notice', () => {
    const w = world();
    const removing: number[] = [];
    observe(w, 'traitRemoving', (type) => removing.push(type));
    const a = createEntity(w);
    const b = createEntity(w);
    const child = createEntity(w, [pair(Parent, a)]);
    expect(getFirstTarget(w, child, Parent)).toBe(a);
    addPair(w, child, Parent, b);
    expect(getTargets(w, child, Parent)).toEqual([b]);
    expect(hasTrait(w, child, pair(Parent, a))).toBe(false);
    expect(hasTrait(w, child, pair(Wildcard, a))).toBe(false);
    expect(removing).toEqual([pair(Parent, a)]);
    expect(query(w, pair(Parent, a))).toEqual([]);
    expect(query(w, pair(Parent, b))).toEqual([child]);
    removePair(w, child, Parent, b);
    expect(getFirstTarget(w, child, Parent)).toBeUndefined();
  });

  it('stores pair data and ignores data on re-add', () => {
    const w = world();
    const inventory = createEntity(w);
    const gold = createEntity(w);
    const silver = createEntity(w);
    addPair(w, inventory, Weighted, gold, { amount: 5 });
    addPair(w, inventory, Weighted, silver);
    setTrait(w, inventory, pair(Weighted, silver), { amount: 12 });
    expect(getTrait(w, inventory, pair(Weighted, gold))).toEqual({ amount: 5 });
    expect(getTrait(w, inventory, pair(Weighted, silver))).toEqual({ amount: 12 });
    addPair(w, inventory, Weighted, gold, { amount: 99 });
    expect(getTrait(w, inventory, pair(Weighted, gold))).toEqual({ amount: 5 });
  });

  it('cleans pairs when targets die and destroys their storage', () => {
    const w = world();
    const person = createEntity(w);
    const fruits = [createEntity(w), createEntity(w), createEntity(w)];
    for (const fruit of fruits) addPair(w, person, Likes, fruit);
    const stores = w.stores.size;
    destroyEntity(w, fruits[1]);
    expect(new Set(getTargets(w, person, Likes))).toEqual(new Set([fruits[0], fruits[2]]));
    expect(w.stores.size).toBeLessThan(stores);
    destroyEntity(w, fruits[0]);
    destroyEntity(w, fruits[2]);
    expect(getTargets(w, person, Likes)).toEqual([]);
    expect(hasTrait(w, person, pair(Likes, Any))).toBe(false);
    expect(isAlive(w, person)).toBe(true);
  });

  it('cascades source destruction through autoDestroy source', () => {
    const w = world();
    const destroyed = vi.fn();
    observe(w, 'entityDestroyed', destroyed);
    const parent = createEntity(w);
    const child = createEntity(w, [pair(Owns, parent)]);
    const grandA = createEntity(w, [pair(Owns, child)]);
    const grandB = createEntity(w, [pair(Owns, child)]);
    const great = createEntity(w, [pair(Owns, grandB)]);
    const bystander = createEntity(w, [pair(Likes, parent)]);
    destroyEntity(w, parent);
    for (const entity of [parent, child, grandA, grandB, great]) expect(isAlive(w, entity)).toBe(false);
    expect(isAlive(w, bystander)).toBe(true);
    expect(getTargets(w, bystander, Likes)).toEqual([]);
    expect(destroyed).toHaveBeenCalledTimes(5);
  });

  it('cascades target destruction through autoDestroy target', () => {
    const w = world();
    const container = createEntity(w);
    const a = createEntity(w);
    const b = createEntity(w);
    addPair(w, container, Contains, a);
    addPair(w, container, Contains, b);
    destroyEntity(w, container);
    expect(isAlive(w, a)).toBe(false);
    expect(isAlive(w, b)).toBe(false);
  });

  it('rejects dead targets and wildcard writes', () => {
    const w = world();
    const entity = createEntity(w);
    const target = createEntity(w);
    destroyEntity(w, target);
    expect(addPair(w, entity, Likes, target)).toBe(false);
    expect(() => addTrait(w, entity, pair(Likes, Any))).toThrow();
  });

  it('filters relation targets with subqueries and keeps the filter live', () => {
    const w = world();
    const Player = Tag;
    const Active = Other;
    const parentA = createEntity(w, [Player, Active]);
    const parentB = createEntity(w, [Player]);
    const parentC = createEntity(w, [Active]);
    const childA = createEntity(w, [pair(ChildOf, parentA)]);
    const childB = createEntity(w, [pair(ChildOf, parentB)]);
    const childC = createEntity(w, [pair(ChildOf, parentC)]);
    expect(query(w, targets(ChildOf, Player))).toEqual([childA, childB]);
    expect(query(w, targets(ChildOf, Player, Active))).toEqual([childA]);
    expect(query(w, targets(ChildOf, Active))).toEqual([childA, childC]);
    expect(query(w, Position, targets(ChildOf, Player))).toEqual([]);

    const q = resolveQuery(w, [targets(ChildOf, Name)]);
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    subscribeQuery(w, q, 'add', onAdd);
    subscribeQuery(w, q, 'remove', onRemove);
    expect(collect(w, q)).toEqual([]);
    addTrait(w, parentB, Name);
    expect(collect(w, q)).toEqual([childB]);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(childB);
    removeTrait(w, parentB, Name);
    expect(collect(w, q)).toEqual([]);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(childB);
    addTrait(w, parentB, Name);
    destroyEntity(w, parentB);
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(isAlive(w, childB)).toBe(true);
  });
});

describe('tracking', () => {
  it('ignores bare spawns', () => {
    const w = world();
    for (const make of [added, changed, removed]) {
      const tracker = createTracker();
      expect(query(w, make(Position, tracker))).toEqual([]);
      const bare = createEntity(w);
      expect(query(w, make(Position, tracker))).not.toContain(bare);
    }
  });

  it('reports additions once until the next event', () => {
    const w = world();
    const tracker = createTracker();
    const a = createEntity(w);
    const b = createEntity(w);
    const c = createEntity(w);
    expect(query(w, added(Tag, tracker))).toEqual([]);
    addTrait(w, a, Tag);
    expect(query(w, added(Tag, tracker))).toEqual([a]);
    expect(query(w, added(Tag, tracker))).toEqual([]);
    addTrait(w, b, Tag);
    expect(query(w, added(Tag, tracker))).toEqual([b]);
    addTrait(w, c, Tag);
    removeTrait(w, c, Tag);
    expect(query(w, added(Tag, tracker))).toEqual([]);
    removeTrait(w, a, Tag);
    addTrait(w, a, Tag);
    expect(query(w, added(Tag, tracker))).toEqual([a]);
    addTrait(w, a, Other);
    expect(query(w, added(Tag, tracker))).toEqual([]);
    expect(query(w, Tag, Other)).toEqual([a]);
  });

  it('applies required, forbidden, alternative, and exclusion terms on first read', () => {
    const w = world({ exclude: [Hidden] });
    const tracker = createTracker();
    const onlyA = createEntity(w, [Tag]);
    createEntity(w, [Tag, Other]);
    const matching = createEntity(w, [Tag, Position]);
    createEntity(w, [Tag, Position, Hidden]);
    expect(query(w, added(Tag, tracker), not(Other))).toEqual([onlyA, matching]);
    expect(query(w, added(Tag, tracker), Position)).toEqual([matching]);
    expect(query(w, added(Tag, tracker), or(Position, Velocity))).toEqual([matching]);
  });

  it.each(['before', 'after'])('combines groups when compiled %s events', (when) => {
    const w = world();
    const Added = createTracker();
    const Changed = createTracker();
    const terms = [added(Tag, Added), or(changed(Position, Changed), added(Other, Added)), added(Name, Added)];
    if (when === 'before') expect(query(w, ...terms)).toEqual([]);
    createEntity(w, [Tag, Name]);
    createEntity(w, [Other]);
    const matching = createEntity(w, [Position]);
    markChanged(w, matching, Position);
    addTrait(w, matching, Name);
    addTrait(w, matching, Tag);
    expect(query(w, ...terms)).toEqual([matching]);
  });

  it.each([added, changed])('forgets a tracked type when it is removed', (make) => {
    const w = world();
    const tracker = createTracker();
    expect(query(w, make(Tag, tracker), make(Other, tracker))).toEqual([]);
    const entity = createEntity(w, [Tag]);
    markChanged(w, entity, Tag);
    removeTrait(w, entity, Tag);
    addTrait(w, entity, Other);
    markChanged(w, entity, Other);
    expect(query(w, make(Tag, tracker), make(Other, tracker))).toEqual([]);
    addTrait(w, entity, Tag);
    markChanged(w, entity, Tag);
    expect(query(w, make(Tag, tracker), make(Other, tracker))).toEqual([entity]);
  });

  it('does not report changes from a removed value after reattachment', () => {
    const w = world();
    const tracker = createTracker();
    const entity = createEntity(w, [Position]);
    setTrait(w, entity, Position, { x: 1 });
    removeTrait(w, entity, Position);
    addTrait(w, entity, Position);
    expect(query(w, changed(Position, tracker))).toEqual([]);
    setTrait(w, entity, Position, { x: 2 });
    expect(query(w, changed(Position, tracker))).toEqual([entity]);
    setTrait(w, entity, Position, { x: 3 }, false);
    expect(query(w, changed(Position, tracker))).toEqual([]);
  });

  it('retains partial history until the remaining event occurs', () => {
    const w = world();
    const tracker = createTracker();
    const entity = createEntity(w, [Tag, Other]);
    expect(query(w, added(Tag, tracker), removed(Other, tracker))).toEqual([]);
    removeTrait(w, entity, Other);
    expect(query(w, added(Tag, tracker), removed(Other, tracker))).toEqual([entity]);
    expect(query(w, added(Tag, tracker), removed(Other, tracker))).toEqual([]);
  });

  it('invalidates opposite events without dropping another matching or branch', () => {
    const w = world();
    const tracker = createTracker();
    const terms = [or(added(Tag, tracker), removed(Other, tracker))];
    expect(query(w, ...terms)).toEqual([]);
    const entity = createEntity(w, [Tag, Other]);
    removeTrait(w, entity, Other);
    removeTrait(w, entity, Tag);
    expect(query(w, ...terms)).toEqual([entity]);
    addTrait(w, entity, Other);
    expect(query(w, ...terms)).toEqual([]);
  });

  it('tracks removals independently per tracker and after registration', () => {
    const w = world();
    const one = createTracker();
    const a = createEntity(w);
    const b = createEntity(w);
    expect(query(w, removed(Tag, one))).toEqual([]);
    addTrait(w, a, Tag);
    addTrait(w, b, Tag);
    expect(query(w, removed(Tag, one))).toEqual([]);
    removeTrait(w, a, Tag);
    expect(query(w, removed(Tag, one))).toEqual([a]);
    addTrait(w, a, Tag);
    removeTrait(w, a, Tag);
    expect(query(w, removed(Tag, one))).toEqual([a]);
    const two = createTracker();
    expect(query(w, removed(Tag, two))).toEqual([]);
    addTrait(w, a, Tag);
    removeTrait(w, a, Tag);
    expect(query(w, removed(Tag, one))).toHaveLength(1);
    addTrait(w, b, Tag);
    removeTrait(w, b, Tag);
    expect(query(w, removed(Tag, one))).toHaveLength(1);
    expect(query(w, removed(Tag, two))).toHaveLength(2);
    destroyEntity(w, a);
    addTrait(w, b, Tag);
    removeTrait(w, b, Tag);
    expect(query(w, removed(Tag, one))).toEqual([b]);
  });

  it('combines removed with static terms', () => {
    const w = world();
    const tracker = createTracker();
    const kept = createEntity(w, [Tag, Position]);
    const dropped = createEntity(w, [Tag]);
    removeTrait(w, kept, Tag);
    removeTrait(w, dropped, Tag);
    expect(query(w, removed(Tag, tracker), Position)).toEqual([kept]);
    expect(query(w, removed(Tag, tracker), not(Position))).toEqual([dropped]);
  });

  it('tracks pairs and relation aggregates', () => {
    const Likes = defineRelation({ schema: { how: 0 } });
    const w = world();
    const tracker = createTracker();
    const person = createEntity(w);
    const target = createEntity(w);
    expect(query(w, added(pair(Likes, Any), tracker))).toEqual([]);
    addPair(w, person, Likes, target);
    expect(query(w, added(pair(Likes, Any), tracker))).toEqual([person]);
    expect(query(w, added(pair(Likes, target), tracker))).toEqual([person]);
    setTrait(w, person, pair(Likes, target), { how: 2 });
    expect(query(w, changed(pair(Likes, target), tracker))).toEqual([person]);
    expect(query(w, changed(pair(Likes, Any), tracker))).toEqual([person]);
    removePair(w, person, Likes, target);
    expect(query(w, removed(pair(Likes, Any), tracker))).toEqual([person]);
    expect(query(w, removed(pair(Likes, target), tracker))).toEqual([person]);
  });

  it('exposes pending membership through versions and subscriptions', () => {
    const w = world();
    const tracker = createTracker();
    const q = resolveQuery(w, [changed(Position, tracker)]);
    const entity = createEntity(w, [Position]);
    collect(w, q);
    const initial = getQueryVersion(w, q);
    const onAdd = vi.fn();
    subscribeQuery(w, q, 'add', onAdd);
    setTrait(w, entity, Position, { x: 10 });
    const bumped = getQueryVersion(w, q);
    expect(bumped).toBeGreaterThan(initial);
    expect(getQueryVersion(w, q)).toBe(bumped);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(entity);
    expect(collect(w, q)).toEqual([entity]);
    expect(collect(w, q)).toEqual([]);
    setTrait(w, entity, Position, { x: 11 });
    expect(onAdd).toHaveBeenCalledTimes(2);
  });
});

describe('reset', () => {
  it('destroys everything with events and keeps handles dead', () => {
    const w = world();
    const destroyed = vi.fn();
    observe(w, 'entityDestroyed', destroyed);
    const q = resolveQuery(w, [Position]);
    const entity = createEntity(w, [Position]);
    createEntity(w);
    resetWorld(w);
    expect(destroyed).toHaveBeenCalledTimes(2);
    expect(isAlive(w, entity)).toBe(false);
    expect(collect(w, q)).toEqual([]);
    const next = createEntity(w, [Position]);
    expect(entityGeneration(next)).toBeGreaterThan(0);
    expect(query(w, Position)).toEqual([next]);
  });
});

describe('hooks', () => {
  it('runs add hooks on defaults and set hooks on supplied values before the add publishes', () => {
    const w = world();
    const A = defineTrait({ x: 0, y: 1 });
    const seen: string[] = [];
    setTraitHooks(A, {
      onAdd(_world, _entity, type, value) {
        expect(type).toBe(A);
        expect(value).toEqual({ x: 0, y: 1 });
        (value as { y: number }).y = 5;
        seen.push('add');
      },
      onSet(_world, _entity, _type, value) {
        expect(value).toEqual({ x: 3, y: 5 });
        (value as { x: number }).x *= 2;
        seen.push('set');
      },
    });
    observe(w, 'traitAdded', (type, entity) => {
      if (type === A) seen.push(`added:${JSON.stringify(getTrait(w, entity, A))}`);
    });
    observe(w, 'traitChanged', (type) => {
      if (type === A) seen.push('changed');
    });
    const tracker = createTracker();
    const entity = createEntity(w, [[A, { x: 3 }]]);
    expect(getTrait(w, entity, A)).toEqual({ x: 6, y: 5 });
    expect(seen).toEqual(['add', 'set', 'added:{"x":6,"y":5}', 'changed']);
    expect(collect(w, resolveQuery(w, [changed(A, tracker)]))).toEqual([entity]);
    const plain = createEntity(w, [A]);
    expect(seen).toEqual(['add', 'set', 'added:{"x":6,"y":5}', 'changed', 'add', 'added:{"x":0,"y":5}']);
    expect(collect(w, resolveQuery(w, [changed(A, tracker)]))).not.toContain(plain);
  });

  it('keeps the previous value when a set hook throws', () => {
    const w = world();
    const A = defineTrait({ x: 0 });
    setTraitHooks(A, {
      onSet(_world, _entity, _type, value) {
        if ((value as { x: number }).x < 0) throw new Error('negative');
      },
    });
    const entity = createEntity(w, [[A, { x: 1 }]]);
    expect(() => setTrait(w, entity, A, { x: -1 })).toThrow('negative');
    expect(getTrait(w, entity, A)).toEqual({ x: 1 });
    setValue(w, entity, A, 'x', 4);
    expect(getTrait(w, entity, A)).toEqual({ x: 4 });
  });

  it('runs remove hooks after observers with the value readable, on remove and destroy', () => {
    const w = world();
    const A = defineTrait({ x: 0 });
    const Tag = defineTrait();
    const seen: string[] = [];
    setTraitHooks(A, {
      onRemove(world, entity, _type, value) {
        expect(hasTrait(world, entity, A)).toBe(true);
        seen.push(`hook:${(value as { x: number }).x}`);
      },
    });
    setTraitHooks(Tag, { onRemove: (_world, _entity, _type, value) => seen.push(`tag:${String(value)}`) });
    observe(w, 'traitRemoving', (type) => {
      if (type === A) seen.push('observer');
    });
    const entity = createEntity(w, [[A, { x: 2 }], Tag]);
    removeTrait(w, entity, A);
    expect(seen).toEqual(['observer', 'hook:2']);
    addTrait(w, entity, A, { x: 3 });
    destroyEntity(w, entity);
    expect(seen).toEqual(['observer', 'hook:2', 'observer', 'hook:3', 'tag:undefined']);
  });

  it('runs target destroy hooks per source before removing the pair', () => {
    const w = world();
    const ChildOf = defineRelation({ schema: { order: 0 } });
    const seen: string[] = [];
    setTraitHooks(ChildOf, {
      onTargetDestroy(world, source, pairId, value) {
        expect(isAlive(world, source)).toBe(true);
        expect(hasTrait(world, source, pairId)).toBe(true);
        seen.push(`target:${(value as { order: number }).order}`);
      },
      onRemove: (_world, _entity, _type, value) => seen.push(`remove:${(value as { order: number }).order}`),
    });
    const parent = createEntity(w);
    const a = createEntity(w, [[pair(ChildOf, parent), { order: 1 }]]);
    const b = createEntity(w, [[pair(ChildOf, parent), { order: 2 }]]);
    destroyEntity(w, parent);
    expect(seen).toEqual(['target:2', 'remove:2', 'target:1', 'remove:1']);
    expect(hasTrait(w, a, pair(ChildOf, Any))).toBe(false);
    expect(isAlive(w, b)).toBe(true);
  });

  it('uses a supplied instance instead of the factory and passes the entity to factories', () => {
    const w = world();
    const factory = vi.fn((_world: World, entity: Entity) => ({ owner: entity }));
    const Box = defineTrait(factory);
    const Fields = defineTrait({ owner: (_world: World, entity: Entity) => entity, count: () => 0 });
    const supplied = { owner: 0 };
    const entity = createEntity(w, [[Box, supplied], Fields]);
    expect(factory).not.toHaveBeenCalled();
    expect(getTrait(w, entity, Box)).toBe(supplied);
    expect(getTrait(w, entity, Fields)).toEqual({ owner: entity, count: 0 });
    const made = createEntity(w, [Box]);
    expect(factory).toHaveBeenCalledWith(w, made);
    expect((getTrait(w, made, Box) as { owner: Entity }).owner).toBe(made);
  });

  it('rejects duplicate hooks, hooks after use, and target hooks on traits', () => {
    const w = world();
    const A = defineTrait({ x: 0 });
    setTraitHooks(A, { onSet: () => {} });
    expect(() => setTraitHooks(A, { onSet: () => {} })).toThrow('already has an onSet hook');
    expect(() => setTraitHooks(A, { onTargetDestroy: () => {} })).toThrow('require a relation');
    createEntity(w, [A]);
    expect(() => setTraitHooks(A, { onAdd: () => {} })).toThrow('before the trait is used');
  });
});
