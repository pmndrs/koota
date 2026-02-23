import type { World } from 'koota';
import { CONSTANTS } from '../constants';
import { Circle } from '../trait/Circle';
import { Color } from '../trait/Color';
import { Mass } from '../trait/Mass';
import { Position } from '../trait/Position';
import { Velocity } from '../trait/Velocity';

let first = false;

export const init = ({ world }: { world: World }) => {
    if (first) return;

    for (let i = 0; i < CONSTANTS.BODIES; i++) {
        addBody(world);
    }

    first = true;
};

export const addBody = (world: World) => {
    world.spawn(Position, Velocity, Mass, Circle, Color);
};
