import type { World } from 'koota';
import { Time, Timer } from '../traits';

export function updateTimers(world: World) {
	const { delta } = world.get(Time)!;

	world.query(Timer).updateEach(([timer], entity) => {
		timer.remaining -= delta;

		if (timer.remaining <= 0) {
			timer.completed = true;
			entity.remove(Timer);
		}
	});
}
