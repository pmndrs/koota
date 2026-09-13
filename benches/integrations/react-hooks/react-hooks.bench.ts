/// <reference lib="dom" />
import './setup-dom';
import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, universe, type Entity } from 'koota';
import { useTrait } from 'koota/react';
import { createElement as h } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const Position = trait({ x: 0, y: 0 });
const Radius = trait({ radius: 1 });
let renders = 0;

function Ball({ entity }: { entity: Entity }) {
  const position = useTrait(entity, Position)!;
  const radius = useTrait(entity, Radius)!;
  renders++;
  return h('div', { 'data-x': position.x, 'data-r': radius.radius });
}

group('React useTrait, 5000 entities @react @hooks', () => {
  for (const [name, step] of [
    ['all entities change', 1],
    ['10% of entities change', 10],
    ['rerender without changes', 0],
  ] as const) {
    bench(name, function* () {
      universe.reset();
      const world = createWorld();
      const entities = Array.from({ length: 5000 }, () => world.spawn(Position, Radius));
      const root = createRoot(document.createElement('div'));
      const render = () =>
        root.render(
          h(
            'div',
            null,
            entities.map((entity) => h(Ball, { key: entity, entity }))
          )
        );
      flushSync(render);

      const result = yield () => {
        renders = 0;
        flushSync(() => {
          if (step === 0) render();
          else {
            world.query(Position).updateEach(([position], _entity, i) => {
              if (i % step === 0) position.x++;
            });
          }
        });
        return renders;
      };

      flushSync(() => root.unmount());
      world.destroy();
      assert.equal(result, step === 0 ? entities.length : Math.ceil(entities.length / step));
      return result;
    });
  }
});
