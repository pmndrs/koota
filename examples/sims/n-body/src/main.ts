// Based on Sander Mertens' ECS N-Body simulation for Flecs
// https://github.com/SanderMertens/ecs_nbody

import { measure, requestAnimationFrame } from '@sim/bench-tools';
import { schedule } from './systems/schedule';
import { world } from './world';

// Start the simulation.
const main = async () => {
	await measure(() => schedule.run({ world }));
	requestAnimationFrame(main);
};

requestAnimationFrame(main);
