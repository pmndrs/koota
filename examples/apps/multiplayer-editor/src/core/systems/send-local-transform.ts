import type { World } from 'koota';
import { Dragging, Position, StableId } from '../traits';
import { sendEphemeralTransform } from '../multiplayer/ephemeral';

// Track last sent values to avoid redundant network sends
const lastSent = new Map<number, string>();

export function sendLocalTransform(world: World) {
    world.query(Position, Dragging, StableId).readEach(([pos, dragging, stableId]) => {
        const deltaX = pos.x - dragging.startX;
        const deltaY = pos.y - dragging.startY;

        // Create a key for change detection (skip if unchanged)
        const key = `${deltaX},${deltaY},1,1,0`;
        if (lastSent.get(stableId.id) === key) return;
        lastSent.set(stableId.id, key);

        console.log('sending transform', deltaX, deltaY);

        sendEphemeralTransform({
            type: 'transform',
            shapeId: stableId.id,
            deltaX,
            deltaY,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
        });
    });
}
