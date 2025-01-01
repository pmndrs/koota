import { World } from 'koota';
import { Time } from '../trait/Time';

export const updateTime = ({ world }: { world: World }) => {
	const time = world.get(Time)!;

	if (time.then === 0) time.then = performance.now();

	const now = performance.now();
	const delta = now - time.then;

	time.delta = Math.min(delta / 1000, 1 / 30);
	time.then = now;

	world.set(Time, time);
};
