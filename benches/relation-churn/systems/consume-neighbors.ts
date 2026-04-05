import type { World } from 'koota';
import { NeighborOf, Position, Velocity } from '../traits';

export const consumeNeighbors = ({ world }: { world: World }) => {
    world.query(Position, Velocity, NeighborOf('*')).updateEach(([position, velocity], entity) => {
        const neighbors = entity.targetsFor(NeighborOf);
        if (neighbors.length === 0) return;

        let cx = 0;
        let cy = 0;
        let cz = 0;
        let sx = 0;
        let sy = 0;
        let sz = 0;

        for (const neighbor of neighbors) {
            const nPos = neighbor.get(Position)!;
            cx += nPos.x;
            cy += nPos.y;
            cz += nPos.z;

            const dx = position.x - nPos.x;
            const dy = position.y - nPos.y;
            const dz = position.z - nPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            sx += dx / distSq;
            sy += dy / distSq;
            sz += dz / distSq;
        }

        const n = neighbors.length;
        // Coherence
        velocity.x += (cx / n - position.x) * 0.01;
        velocity.y += (cy / n - position.y) * 0.01;
        velocity.z += (cz / n - position.z) * 0.01;
        // Separation
        velocity.x += (sx / n) * 10;
        velocity.y += (sy / n) * 10;
        velocity.z += (sz / n) * 10;
    });
};
