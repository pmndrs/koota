import type { World } from 'koota';
import { CONFIG } from '../config';
import { NeighborOf, Position } from '../traits';

export const updateNeighbors = ({ world }: { world: World }) => {
	const { neighborRadius, maxNeighborsPerEntity } = CONFIG;
	const radiusSq = neighborRadius * neighborRadius;
	const entities = world.query(Position);

	for (const entity of entities) {
		entity.remove(NeighborOf('*'));
	}

	for (const entityA of entities) {
		const posA = entityA.get(Position)!;
		let count = 0;

		for (const entityB of entities) {
			if (entityA.id() === entityB.id()) continue;

			const posB = entityB.get(Position)!;
			const dx = posA.x - posB.x;
			const dy = posA.y - posB.y;
			const dz = posA.z - posB.z;

			if (dx * dx + dy * dy + dz * dz < radiusSq) {
				entityA.add(NeighborOf(entityB));
				if (++count >= maxNeighborsPerEntity) break;
			}
		}
	}
};
