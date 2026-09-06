import type { World } from 'koota';
import { Ball, Position, Scale, Time, Velocity } from '../traits';

export function updateBallCollision(world: World) {
  const { delta } = world.get(Time)!;
  const invDelta = delta > 0 ? 1 / delta : 0;

  const pages = world.query(Position, Velocity, Ball).getPages();
  for (const pageA of pages) {
    const [positionA, velocityA, ballA] = pageA.stores;
    const aPosX = positionA.x;
    const aPosY = positionA.y;
    const aVelX = velocityA.x;
    const aVelY = velocityA.y;
    const aRadius = ballA.radius;

    for (let ai = 0; ai < pageA.indices.length; ai++) {
      const offsetA = pageA.indices[ai];
      const entityA = pageA.entities[ai];

      const xA = aPosX[offsetA];
      const yA = aPosY[offsetA];
      const scaleA = entityA.get(Scale)?.value ?? 1;
      const radiusA = aRadius[offsetA] * scaleA;
      const massA = radiusA * radiusA * Math.PI;

      for (let bPageIndex = pageA.index; bPageIndex < pages.length; bPageIndex++) {
        const pageB = pages[bPageIndex];
        const [positionB, velocityB, ballB] = pageB.stores;
        const bStart = pageA === pageB ? ai + 1 : 0;
        const bPosX = positionB.x;
        const bPosY = positionB.y;
        const bVelX = velocityB.x;
        const bVelY = velocityB.y;
        const bRadius = ballB.radius;

        for (let bi = bStart; bi < pageB.indices.length; bi++) {
          const offsetB = pageB.indices[bi];
          const entityB = pageB.entities[bi];

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
}
