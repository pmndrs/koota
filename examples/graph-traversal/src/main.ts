import { measure, requestAnimationFrame } from '@examples/bench-tools';
import { init } from './systems/init';
import { schedule } from './systems/schedule';
import { world } from './world';

// Build the graph once.
init({ world });

// Start the simulation.
const main = () => {
    measure(() => schedule.run({ world }));
    requestAnimationFrame(main);
};

requestAnimationFrame(main);
