import { createChanged, Not, type World } from 'koota';
import { Position, Rotation, Scale, Color, StableId, EditedBy, IsLocal, IsTombstoned } from '../traits';
import { sendEditUpdate } from '../multiplayer/ephemeral';

// Create a Changed modifier instance for tracking trait changes
const Changed = createChanged();

// Helper to check if entity has a local editor
function hasLocalEditor(entity: ReturnType<World['query']> extends { readEach: (cb: (t: any, e: infer E) => void) => void } ? E : never): boolean {
    return entity.targetsFor(EditedBy).some((editor) => editor.has(IsLocal));
}

export function broadcastLocalEdits(world: World) {
    // Broadcast position changes
    world.query(EditedBy('*'), StableId, Changed(Position), Not(IsTombstoned)).readEach(([stableId, pos], entity) => {
        if (!hasLocalEditor(entity)) return;
        sendEditUpdate({
            shapeId: stableId.id,
            x: pos.x,
            y: pos.y,
        });
    });

    // Broadcast rotation changes
    world.query(EditedBy('*'), StableId, Changed(Rotation), Not(IsTombstoned)).readEach(([stableId, rot], entity) => {
        if (!hasLocalEditor(entity)) return;
        sendEditUpdate({
            shapeId: stableId.id,
            angle: rot.angle,
        });
    });

    // Broadcast scale changes
    world.query(EditedBy('*'), StableId, Changed(Scale), Not(IsTombstoned)).readEach(([stableId, scale], entity) => {
        if (!hasLocalEditor(entity)) return;
        sendEditUpdate({
            shapeId: stableId.id,
            scaleX: scale.x,
            scaleY: scale.y,
        });
    });

    // Broadcast color changes
    world.query(EditedBy('*'), StableId, Changed(Color), Not(IsTombstoned)).readEach(([stableId, color], entity) => {
        if (!hasLocalEditor(entity)) return;
        sendEditUpdate({
            shapeId: stableId.id,
            fill: color.fill,
        });
    });
}
