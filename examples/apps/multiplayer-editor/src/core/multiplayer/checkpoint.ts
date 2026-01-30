import type { World } from 'koota';
import {
    Color,
    EditingColor,
    EditingPosition,
    EditingRotation,
    EditingScale,
    History,
    IsTombstoned,
    Position,
    Rotation,
    Scale,
    Shape,
    StableId,
} from '../traits';
import { isLocallyEditing } from '../utils/editing-helpers';
import type { Checkpoint } from './protocol';

export function createCheckpoint(world: World, seq: number): Checkpoint {
    const shapes: Checkpoint['shapes'] = [];
    world
        .query(StableId, Shape, Position, Rotation, Scale, Color)
        .readEach(([id, shape, pos, rot, scale, color]) => {
            shapes.push({
                id: id.id,
                type: shape.type,
                x: pos.x,
                y: pos.y,
                rotation: rot.angle,
                scaleX: scale.x,
                scaleY: scale.y,
                color: { r: color.r, g: color.g, b: color.b },
            });
        });

    return { seq, shapes: shapes.sort((a, b) => a.id - b.id) };
}

/**
 * Apply checkpoint using in-place diff.
 * Preserves entity handles so React components don't remount,
 * DOM refs stay valid, and pointer capture is maintained.
 *
 * For locally-edited properties, updates durable state instead of live state
 * so the user's interaction is not interrupted.
 */
export function applyCheckpoint(world: World, checkpoint: Checkpoint) {
    const history = world.get(History)!;
    const seen = new Set<number>();

    for (const shape of checkpoint.shapes) {
        seen.add(shape.id);
        const existing = history.entities.get(shape.id);

        if (existing?.isAlive()) {
            // Update in place — entity handle preserved
            existing.set(Shape, { type: shape.type });

            const locallyEditing = isLocallyEditing(existing);

            // Position: if locally editing, update durable; otherwise update live
            if (locallyEditing && existing.has(EditingPosition)) {
                const editing = existing.get(EditingPosition)!;
                existing.set(EditingPosition, {
                    ...editing,
                    durableX: shape.x,
                    durableY: shape.y,
                });
            } else {
                existing.set(Position, { x: shape.x, y: shape.y });
            }

            // Rotation
            if (locallyEditing && existing.has(EditingRotation)) {
                const editing = existing.get(EditingRotation)!;
                existing.set(EditingRotation, { ...editing, durableAngle: shape.rotation });
            } else {
                existing.set(Rotation, { angle: shape.rotation });
            }

            // Scale
            if (locallyEditing && existing.has(EditingScale)) {
                const editing = existing.get(EditingScale)!;
                existing.set(EditingScale, {
                    ...editing,
                    durableX: shape.scaleX,
                    durableY: shape.scaleY,
                });
            } else {
                existing.set(Scale, { x: shape.scaleX, y: shape.scaleY });
            }

            // Color
            if (locallyEditing && existing.has(EditingColor)) {
                const editing = existing.get(EditingColor)!;
                existing.set(EditingColor, {
                    ...editing,
                    durableR: shape.color.r,
                    durableG: shape.color.g,
                    durableB: shape.color.b,
                });
            } else {
                existing.set(Color, { r: shape.color.r, g: shape.color.g, b: shape.color.b });
            }

            // Revive if tombstoned
            if (existing.has(IsTombstoned)) {
                existing.remove(IsTombstoned);
            }
        } else {
            // New shape — spawn
            const entity = world.spawn(
                StableId({ id: shape.id }),
                Shape({ type: shape.type }),
                Position({ x: shape.x, y: shape.y }),
                Rotation({ angle: shape.rotation }),
                Scale({ x: shape.scaleX, y: shape.scaleY }),
                Color({ r: shape.color.r, g: shape.color.g, b: shape.color.b })
            );
            history.entities.set(shape.id, entity);
        }
    }

    // Destroy shapes not in checkpoint
    for (const [id, entity] of history.entities) {
        if (!seen.has(id) && entity.isAlive()) {
            entity.destroy();
            history.entities.delete(id);
        }
    }

    world.set(History, {
        ...history,
        nextSeq: Math.max(history.nextSeq, checkpoint.seq + 1),
    });
}
