import { Circle, Color, Position } from '@sim/add-remove';
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

    entities.useStores(([position, circle, color]) => {
        for (let i = 0; i < entities.length; i++) {
            const eid = entities[i].id();

            // Update positions
            positions[eid * 3] = position.x[eid];
            positions[eid * 3 + 1] = position.y[eid];
            positions[eid * 3 + 2] = position.z[eid];

            // Update sizes
            sizes[eid] = circle.radius[eid] * 0.3;

            // Update colors
            const r = normalize(color.r[eid], 0, 255);
            const g = normalize(color.g[eid], 0, 255);
            const b = normalize(color.b[eid], 0, 255);
            colors[eid * 3] = r;
            colors[eid * 3 + 1] = g;
            colors[eid * 3 + 2] = b;
        }

        for (let i = 0; i < removedEntities.length; i++) {
            const eid = removedEntities[i];
            sizes[eid] = 0;
        }
    });

    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;
    particles.geometry.attributes.size.needsUpdate = true;
};
