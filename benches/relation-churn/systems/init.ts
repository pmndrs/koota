import type { Entity, World } from 'koota';
import { CONFIG } from '../config';
import { Position, Velocity } from '../traits';

export const allEntities: Entity[] = [];

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const init = ({ world }: { world: World }) => {
    const { entityCount } = CONFIG;
    const spread = 500;

    for (let i = 0; i < entityCount; i++) {
        const entity = world.spawn(
            Position({
                x: randomRange(-spread, spread),
                y: randomRange(-spread, spread),
                z: randomRange(-spread, spread),
            }),
            Velocity({
                x: randomRange(-1, 1),
                y: randomRange(-1, 1),
                z: randomRange(-1, 1),
            })
        );
        allEntities.push(entity);
    }
};
