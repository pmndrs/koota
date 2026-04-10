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

    entities.useStores(([position, circle, color], layout) => {
        const { pageCount, pageIds, pageStarts, pageCounts, offsets, entities } = layout;

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            const pageId = pageIds[pageIndex];
            const start = pageStarts[pageIndex];
            const end = start + pageCounts[pageIndex];
            const posX = position.x[pageId];
            const posY = position.y[pageId];
            const posZ = position.z[pageId];
            const radius = circle.radius[pageId];
            const colorR = color.r[pageId];
            const colorG = color.g[pageId];
            const colorB = color.b[pageId];

            for (let i = start; i < end; i++) {
                const eid = entities[i].id();
                const offset = offsets[i];

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
    });

    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;
    particles.geometry.attributes.size.needsUpdate = true;
};
