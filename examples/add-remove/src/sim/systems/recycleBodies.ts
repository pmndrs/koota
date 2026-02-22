import type { World } from 'koota';
import { CONSTANTS } from '../constants';
import { Circle, Color, Mass, Position, Velocity } from '../trait';
import { addBody } from './init';

let draining = true;

export const recycleBodiesSim = ({ world }: { world: World }) => {
    const entities = world.query(Position, Circle, Mass, Velocity, Color);

    if (entities.length === 0) draining = false;
    if (entities.length > CONSTANTS.BODIES * 0.95) draining = true;

    entities.select(Position).updateEach(([position], entity) => {
        if (position.y < CONSTANTS.FLOOR) {
            // Remove the entity
            entity.destroy();

            if (!CONSTANTS.DRAIN) addBody(world);
        }
    });

    if (!CONSTANTS.DRAIN) return;

    const target = Math.min(
        Math.max(CONSTANTS.BODIES * 0.01, entities.length * 0.5),
        CONSTANTS.BODIES - entities.length
    );

    if (!draining) {
        for (let i = 0; i < target; i++) {
            addBody(world);
        }
    }
};
