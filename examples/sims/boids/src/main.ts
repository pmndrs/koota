import { measure, requestAnimationFrame } from '@sim/bench-tools';
import { actions } from './actions';
import { CONFIG } from './config';
import { schedule } from './systems/schedule';
import { world } from './world';

// Start the simulation.
const main = async () => {
    const { initialCount } = CONFIG;
    const { spawnBoid } = actions(world);

    // Spawn the initial boids.
    for (let i = 0; i < initialCount; i++) {
        spawnBoid();
    }

    await measure(() => schedule.run({ world }));
    requestAnimationFrame(main);
};

requestAnimationFrame(main);
