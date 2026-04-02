import { bench, group } from '@pmndrs/labs';
import { createChanged, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Changed = createChanged();

group('change detection 50k @change @query', () => {
	for (const changeCount of [10, 100, 1000]) {
		bench(`${changeCount} changed`, function* () {
			const world = createWorld();
			const entities: Entity[] = [];
			for (let i = 0; i < 50_000; i++) {
				entities.push(world.spawn(Position, Velocity));
			}
			world.query(Changed(Position));

			const step = Math.floor(50_000 / changeCount);
			yield () => {
				for (let i = 0; i < changeCount; i++) {
					entities[i * step].set(Position, { x: i, y: i, z: i });
				}
				world.query(Changed(Position));
			};

			world.destroy();
		}).gc('inner');
	}
});
