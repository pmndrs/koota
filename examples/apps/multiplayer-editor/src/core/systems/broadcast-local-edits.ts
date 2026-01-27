import type { World } from 'koota';
import { Position, Rotation, Scale, Color, StableId, EditedBy, IsLocal } from '../traits';
import { sendEditUpdate } from '../multiplayer/ephemeral';

// Track last sent values to avoid redundant network sends
const lastSent = new Map<number, string>();

export function broadcastLocalEdits(world: World) {
    // Find shapes being edited locally
    world.query(EditedBy('*'), StableId).readEach((_, entity) => {
        const hasLocalEditor = entity.targetsFor(EditedBy).some((editor) => editor.has(IsLocal));
        if (!hasLocalEditor) return; // Only broadcast local edits

        const stableId = entity.get(StableId)!;
        const pos = entity.get(Position);
        const rot = entity.get(Rotation);
        const scale = entity.get(Scale);
        const color = entity.get(Color);

        // Create a key for change detection (skip if unchanged)
        const key = `${pos?.x ?? ''},${pos?.y ?? ''},${rot?.angle ?? ''},${scale?.x ?? ''},${scale?.y ?? ''},${color?.fill ?? ''}`;
        if (lastSent.get(stableId.id) === key) return;
        lastSent.set(stableId.id, key);

        // Send absolute current values
        sendEditUpdate({
            shapeId: stableId.id,
            x: pos?.x,
            y: pos?.y,
            angle: rot?.angle,
            scaleX: scale?.x,
            scaleY: scale?.y,
            fill: color?.fill,
        });
    });
}
