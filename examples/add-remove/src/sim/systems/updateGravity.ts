import type { World } from 'koota';
import { CONSTANTS } from '../constants';
import { Time, Velocity } from '../trait';

export const updateGravity = ({ world }: { world: World }) => {
    const { delta } = world.get(Time)!;

    world.query(Velocity).updateEach(([velocity]) => {
        // Apply gravity directly to the velocity
        velocity.y += CONSTANTS.GRAVITY * delta;
    });
};
