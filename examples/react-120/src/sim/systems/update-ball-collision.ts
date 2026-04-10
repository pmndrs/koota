import type { World } from 'koota';
import { Ball, Position, Scale, Time, Velocity } from '../traits';

export function updateBallCollision(world: World) {
    const { delta } = world.get(Time)!;
    const invDelta = delta > 0 ? 1 / delta : 0;

    world.query(Position, Velocity, Ball).useStores(([position, velocity, ball], layout) => {
        const { pageCount, pageIds, pageStarts, pageCounts, offsets, entities } = layout;

        for (let aPageIndex = 0; aPageIndex < pageCount; aPageIndex++) {
            const aPageId = pageIds[aPageIndex];
            const aStart = pageStarts[aPageIndex];
            const aEnd = aStart + pageCounts[aPageIndex];
            const aPosX = position.x[aPageId];
            const aPosY = position.y[aPageId];
            const aVelX = velocity.x[aPageId];
            const aVelY = velocity.y[aPageId];
            const aRadius = ball.radius[aPageId];

            for (let ai = aStart; ai < aEnd; ai++) {
                const offsetA = offsets[ai];
                const entityA = entities[ai];

                const xA = aPosX[offsetA];
                const yA = aPosY[offsetA];
                const scaleA = entityA.get(Scale)?.value ?? 1;
                const radiusA = aRadius[offsetA] * scaleA;
                const massA = radiusA * radiusA * Math.PI;

                for (let bPageIndex = aPageIndex; bPageIndex < pageCount; bPageIndex++) {
                    const bPageId = pageIds[bPageIndex];
                    const bPageStart = pageStarts[bPageIndex];
                    const bEnd = bPageStart + pageCounts[bPageIndex];
                    const bStart = bPageIndex === aPageIndex ? ai + 1 : bPageStart;
                    const bPosX = position.x[bPageId];
                    const bPosY = position.y[bPageId];
                    const bVelX = velocity.x[bPageId];
                    const bVelY = velocity.y[bPageId];
                    const bRadius = ball.radius[bPageId];

                    for (let bi = bStart; bi < bEnd; bi++) {
                        const offsetB = offsets[bi];
                        const entityB = entities[bi];

                        const xB = bPosX[offsetB];
                        const yB = bPosY[offsetB];
                        const scaleB = entityB.get(Scale)?.value ?? 1;
                        const radiusB = bRadius[offsetB] * scaleB;

                        const rsum = radiusA + radiusB;
                        const dx = xA - xB;
                        const dy = yA - yB;

                        // AABB early-out
                        if (dx > rsum || -dx > rsum || dy > rsum || -dy > rsum) continue;

                        // Circle overlap check
                        const distSq = dx * dx + dy * dy;
                        if (distSq >= rsum * rsum) continue;

                        // Penetration along the center line (mirrors reference scaling by radius sum)
                        const dist = Math.sqrt(distSq) || 1;
                        const penetration = dist - rsum; // negative
                        const invNorm = 1 / rsum;
                        const offX = dx * penetration * invNorm;
                        const offY = dy * penetration * invNorm;

                        // Mass-based momentum distribution (πr²)
                        const massB = radiusB * radiusB * Math.PI;
                        const invTotal = 1 / (massA + massB);
                        const ratioA = massB * invTotal; // push A by proportion of B
                        const ratioB = massA * invTotal; // push B by proportion of A

                        // Convert position-like offsets to per-second velocity impulses
                        aVelX[offsetA] -= offX * ratioA * invDelta;
                        aVelY[offsetA] -= offY * ratioA * invDelta;
                        bVelX[offsetB] += offX * ratioB * invDelta;
                        bVelY[offsetB] += offY * ratioB * invDelta;
                    }
                }
            }
        }
    });
}
