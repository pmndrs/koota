import { World } from 'koota';
import { NeighborOf, Position } from '../traits';

const radius = 40;
const maxNeighbors = 20;

// This is very inefficient and you shouldn't create relations like
// a machine gun but it is good for testing relation performance.
export function updateNeighbors({ world }: { world: World }) {
    const entities = world.query(Position);

    // Remove all neighbors
    for (const entity of entities) {
        entity.remove(NeighborOf('*'));
    }

    for (const entityA of entities) {
        let neighbors = 0;

        // For each entity, find all entities within a radius
        for (const entityB of entities) {
            if (entityA.id() === entityB.id()) continue;

            const positionA = entityA.get(Position)!;
            const positionB = entityB.get(Position)!;

            const distance = Math.sqrt(
                (positionA.x - positionB.x) ** 2 +
                    (positionA.y - positionB.y) ** 2 +
                    (positionA.z - positionB.z) ** 2
            );

            if (distance < radius) {
                entityA.add(NeighborOf(entityB));
                // entityB.add(NeighborOf(entityA));

                neighbors++;
                if (neighbors >= maxNeighbors) break;
            }
        }
    }
}
