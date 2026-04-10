import type { World } from 'koota';
import { CONSTANTS } from '../constants';
import { Time } from '../traits/Time';
import { bodyTraits } from './setInitial';

export const updateGravity = ({ world }: { world: World }) => {
    const bodies = world.query(...bodyTraits);
    const { delta } = world.get(Time)!;

    bodies.useStores(([position, velocity, mass, _, acceleration], layout) => {
        const { pageCount, pageIds, pageStarts, pageCounts, offsets } = layout;

        for (let currentPageIndex = 0; currentPageIndex < pageCount; currentPageIndex++) {
            const currentPageId = pageIds[currentPageIndex];
            const currentStart = pageStarts[currentPageIndex];
            const currentEnd = currentStart + pageCounts[currentPageIndex];
            const currentPosX = position.x[currentPageId];
            const currentPosY = position.y[currentPageId];
            const currentVelX = velocity.x[currentPageId];
            const currentVelY = velocity.y[currentPageId];
            const currentMass = mass.value[currentPageId];
            const currentAccX = acceleration.x[currentPageId];
            const currentAccY = acceleration.y[currentPageId];

            for (let currentIndex = currentStart; currentIndex < currentEnd; currentIndex++) {
                const currentOffset = offsets[currentIndex];
                const currentX = currentPosX[currentOffset];
                const currentY = currentPosY[currentOffset];
                const bodyMass = +currentMass[currentOffset];

                currentAccX[currentOffset] = 0;
                currentAccY[currentOffset] = 0;

                for (let targetPageIndex = 0; targetPageIndex < pageCount; targetPageIndex++) {
                    const targetPageId = pageIds[targetPageIndex];
                    const targetStart = pageStarts[targetPageIndex];
                    const targetEnd = targetStart + pageCounts[targetPageIndex];
                    const targetPosX = position.x[targetPageId];
                    const targetPosY = position.y[targetPageId];
                    const targetMass = mass.value[targetPageId];

                    for (let targetIndex = targetStart; targetIndex < targetEnd; targetIndex++) {
                        const targetOffset = offsets[targetIndex];

                        if (
                            currentPageId === targetPageId &&
                            currentOffset === targetOffset
                        ) {
                            continue;
                        }

                        const dx = targetPosX[targetOffset] - currentX;
                        const dy = targetPosY[targetOffset] - currentY;
                        let distanceSquared = dx * dx + dy * dy;

                        if (distanceSquared < CONSTANTS.STICKY) distanceSquared = CONSTANTS.STICKY;

                        const distance = Math.sqrt(distanceSquared);
                        const forceMagnitude =
                            (bodyMass * +targetMass[targetOffset]) / distanceSquared;

                        currentAccX[currentOffset] += (dx / distance) * forceMagnitude;
                        currentAccY[currentOffset] += (dy / distance) * forceMagnitude;
                    }
                }

                // Apply computed force to entity's velocity, adjusting for its mass
                currentVelX[currentOffset] += (currentAccX[currentOffset] * delta) / bodyMass;
                currentVelY[currentOffset] += (currentAccY[currentOffset] * delta) / bodyMass;
            }
        }
    });
};
