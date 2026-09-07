import { assert, bench, group } from '@pmndrs/labs';
import { createChanged, createWorld, trait, type Entity, type World } from 'koota';

const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });
const Changed = createChanged();

// Every entity changes Position every frame, the n-body shape.
// The floor is the same loop with change detection disabled.
group('dense change detection 10k @change @dense', () => {
  const count = 10_000;

  const setup = () => {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < count; i++) {
      entities.push(world.spawn(Position({ x: i, y: i }), Velocity({ x: 1, y: 2 })));
    }
    return { world, entities };
  };

  const move = (world: World, changeDetection: 'auto' | 'always' | 'never') => {
    world.query(Position, Velocity).updateEach(
      ([position, velocity]) => {
        position.x += velocity.x;
        position.y += velocity.y;
      },
      { changeDetection }
    );
  };

  bench('updateEach never', function* () {
    const { world, entities } = setup();
    let frames = 0;
    yield () => {
      move(world, 'never');
      frames++;
    };
    assert.equal(entities[0].get(Position)!.x, frames);
    assert.equal(entities[count - 1].get(Position)!.y, count - 1 + frames * 2);
    world.destroy();
  }).baseline();

  bench('updateEach auto, no consumers', function* () {
    const { world, entities } = setup();
    let frames = 0;
    yield () => {
      move(world, 'auto');
      frames++;
    };
    assert.equal(entities[0].get(Position)!.x, frames);
    assert.equal(entities[count - 1].get(Position)!.y, count - 1 + frames * 2);
    world.destroy();
  });

  bench('updateEach auto, Changed query', function* () {
    const { world } = setup();
    world.query(Changed(Position));
    let seen = 0;
    yield () => {
      move(world, 'auto');
      seen = world.query(Changed(Position)).length;
    };
    world.destroy();
    assert.equal(seen, count);
    return seen;
  });

  bench('updateEach always, Changed query', function* () {
    const { world } = setup();
    world.query(Changed(Position));
    let seen = 0;
    yield () => {
      move(world, 'always');
      seen = world.query(Changed(Position)).length;
    };
    world.destroy();
    assert.equal(seen, count);
    return seen;
  });

  bench('set loop, Changed query', function* () {
    const { world, entities } = setup();
    world.query(Changed(Position));
    let seen = 0;
    let frame = 0;
    yield () => {
      frame++;
      for (let i = 0; i < count; i++) {
        entities[i].set(Position, { x: i + frame, y: i + frame * 2 });
      }
      seen = world.query(Changed(Position)).length;
    };
    world.destroy();
    assert.equal(seen, count);
    return seen;
  });

  bench('updateEach auto, world.onChange', function* () {
    const { world } = setup();
    let hits = 0;
    world.onChange(Position, () => hits++);
    yield () => {
      hits = 0;
      move(world, 'auto');
    };
    world.destroy();
    assert.equal(hits, count);
    return hits;
  });

  bench('updateEach auto, entity.onChange each', function* () {
    const { world, entities } = setup();
    let hits = 0;
    for (const entity of entities) entity.onChange(Position, () => hits++);
    yield () => {
      hits = 0;
      move(world, 'auto');
    };
    world.destroy();
    assert.equal(hits, count);
    return hits;
  });
});
