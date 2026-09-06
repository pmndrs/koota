import type { World } from 'koota';
import { CONSTANTS } from '../constants';
import { Time } from '../traits/Time';
import { bodyTraits } from './setInitial';

export const updateGravity = ({ world }: { world: World }) => {
  const pages = world.query(...bodyTraits).getPages();
  const { delta } = world.get(Time)!;

  for (const currentPage of pages) {
    const [position, velocity, mass, , acceleration] = currentPage.stores;
    const currentPosX = position.x;
    const currentPosY = position.y;
    const currentVelX = velocity.x;
    const currentVelY = velocity.y;
    const currentMass = mass.value;
    const currentAccX = acceleration.x;
    const currentAccY = acceleration.y;

    for (let currentIndex = 0; currentIndex < currentPage.indices.length; currentIndex++) {
      const currentOffset = currentPage.indices[currentIndex];
      const currentX = currentPosX[currentOffset];
      const currentY = currentPosY[currentOffset];
      const bodyMass = +currentMass[currentOffset];

      currentAccX[currentOffset] = 0;
      currentAccY[currentOffset] = 0;

      for (const targetPage of pages) {
        const [targetPosition, , targetBodyMass] = targetPage.stores;
        const targetPosX = targetPosition.x;
        const targetPosY = targetPosition.y;
        const targetMass = targetBodyMass.value;

        for (let targetIndex = 0; targetIndex < targetPage.indices.length; targetIndex++) {
          const targetOffset = targetPage.indices[targetIndex];

          if (currentPage === targetPage && currentOffset === targetOffset) {
            continue;
          }

          const dx = targetPosX[targetOffset] - currentX;
          const dy = targetPosY[targetOffset] - currentY;
          let distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < CONSTANTS.STICKY) distanceSquared = CONSTANTS.STICKY;

          const distance = Math.sqrt(distanceSquared);
          const forceMagnitude = (bodyMass * +targetMass[targetOffset]) / distanceSquared;

          currentAccX[currentOffset] += (dx / distance) * forceMagnitude;
          currentAccY[currentOffset] += (dy / distance) * forceMagnitude;
        }
      }

      // Apply computed force to entity's velocity, adjusting for its mass
      currentVelX[currentOffset] += (currentAccX[currentOffset] * delta) / bodyMass;
      currentVelY[currentOffset] += (currentAccY[currentOffset] * delta) / bodyMass;
    }
  }
};
