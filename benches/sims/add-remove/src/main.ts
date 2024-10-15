// Based on Sander Mertens' ECS N-Body simulation for Flecs
// https://github.com/SanderMertens/ecs_nbody

import { measure, requestAnimationFrame } from '@sim/bench-tools';
import { init } from './systems/init';
import { world } from './world';
import { schedule } from './systems/schedule';

// Start the simulation.
const main = () => {
	measure(() => schedule.run({ world }));
	requestAnimationFrame(main);
};

// Initialize all entities.
init({ world });

requestAnimationFrame(main);
