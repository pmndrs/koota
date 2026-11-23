import { World, getEntityId } from 'koota';
import { NeighborOf, Position } from '../traits';

const radius = 40;
const maxNeighbors = 20;

// This is very inefficient and you shouldn't create relations like
// a machine gun but it is good for testing relation performance.
export function updateNeighbors({ world }: { world: World }) {
  const entities = world.query(Position);

  // Remove all neighbors
  for (const entity of entities) {
    world.remove(entity, NeighborOf('*'));
  }

  for (const entityA of entities) {
    let neighbors = 0;

    // For each entity, find all entities within a radius
    for (const entityB of entities) {
      if (getEntityId(entityA) === getEntityId(entityB)) continue;

      const positionA = world.get(entityA, Position)!;
      const positionB = world.get(entityB, Position)!;

      const distance = Math.sqrt(
        (positionA.x - positionB.x) ** 2 +
          (positionA.y - positionB.y) ** 2 +
          (positionA.z - positionB.z) ** 2
      );

      if (distance < radius) {
        world.add(entityA, NeighborOf(entityB));
        // world.add(entityB, NeighborOf(entityA));

        neighbors++;
        if (neighbors >= maxNeighbors) break;
      }
    }
  }
}
