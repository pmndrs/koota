// Based on Sander Mertens' ECS N-Body simulation for Flecs
// https://github.com/SanderMertens/ecs_nbody

import { measure, requestAnimationFrame } from '@sim/bench-tools';
import { world } from './world';
import { schedule } from './systems/schedule';

// Start the simulation.
const main = async () => {
	await measure(() => schedule.run({ world }));
	requestAnimationFrame(main);
};

requestAnimationFrame(main);
