import { Circle, Color, Position } from '../../sim';
import { createRemoved, type World } from 'koota';
import { Points } from '../trait/Points';

const normalize = (x: number, min: number, max: number) => (x - min) / (max - min);
const Removed = createRemoved();

export const syncThreeObjects = ({ world }: { world: World }) => {
  const entities = world.query(Position, Circle, Color);
  const removedEntities = world.query(Removed(Position, Circle, Color));

  const particlesEntity = world.queryFirst(Points);
  if (!particlesEntity) return;

  const particles = particlesEntity.get(Points)!.object;

  const positions = particles.geometry.attributes.position.array;
  const colors = particles.geometry.attributes.color.array;
  const sizes = particles.geometry.attributes.size.array;

  for (const {
    stores: [position, circle, color],
    indices,
    entities: pageEntities,
  } of entities.getPages()) {
    const posX = position.x;
    const posY = position.y;
    const posZ = position.z;
    const radius = circle.radius;
    const colorR = color.r;
    const colorG = color.g;
    const colorB = color.b;

    for (let i = 0; i < indices.length; i++) {
      const eid = pageEntities[i].id();
      const offset = indices[i];

      // Update positions
      positions[eid * 3] = posX[offset];
      positions[eid * 3 + 1] = posY[offset];
      positions[eid * 3 + 2] = posZ[offset];

      // Update sizes
      sizes[eid] = radius[offset] * 0.3;

      // Update colors
      const r = normalize(colorR[offset], 0, 255);
      const g = normalize(colorG[offset], 0, 255);
      const b = normalize(colorB[offset], 0, 255);
      colors[eid * 3] = r;
      colors[eid * 3 + 1] = g;
      colors[eid * 3 + 2] = b;
    }
  }

  for (let i = 0; i < removedEntities.length; i++) {
    const eid = removedEntities[i].id();
    sizes[eid] = 0;
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
  particles.geometry.attributes.size.needsUpdate = true;
};
