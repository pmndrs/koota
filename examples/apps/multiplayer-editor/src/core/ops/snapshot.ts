import type { World } from 'koota';
import type { Op } from '../types';
import { OpCode } from '../types';
import { History, Position, Rotation, Scale, Color, Shape } from '../traits';

/**
 * Captures the current state of an entity as an op that would restore to that state.
 * Used for Figma-style undo/redo where redo restores to "state at undo time"
 * rather than replaying the original op.
 */
export function captureCurrentState(world: World, op: Op): Op | null {
    const history = world.get(History);
    if (!history) return null;

    const entity = history.entities.get(op.id);

    switch (op.op) {
        case OpCode.CreateShape: {
            // Entity exists -> capture its current state for redo (which would recreate it)
            if (entity && entity.isAlive()) {
                const pos = entity.get(Position);
                const rot = entity.get(Rotation);
                const scale = entity.get(Scale);
                const color = entity.get(Color);
                const shape = entity.get(Shape);
                if (!pos || !rot || !scale || !color || !shape) return null;
                return {
                    op: OpCode.CreateShape,
                    id: op.id,
                    seq: 0,
                    shape: shape.type,
                    x: pos.x,
                    y: pos.y,
                    rotation: rot.angle,
                    scaleX: scale.x,
                    scaleY: scale.y,
                    color: color.fill,
                };
            }
            return null;
        }

        case OpCode.DeleteShape: {
            // Entity doesn't exist -> redo should delete it (need to capture what to delete)
            // We use the op's stored state since the entity is gone
            return {
                op: OpCode.DeleteShape,
                id: op.id,
                seq: 0,
                shape: op.shape,
                x: op.x,
                y: op.y,
                rotation: op.rotation,
                scaleX: op.scaleX,
                scaleY: op.scaleY,
                color: op.color,
            };
        }

        case OpCode.UpdatePosition: {
            if (!entity || !entity.isAlive()) return null;
            const pos = entity.get(Position);
            if (!pos) return null;
            return {
                op: OpCode.UpdatePosition,
                id: op.id,
                seq: 0,
                x: pos.x,
                y: pos.y,
                prevX: op.prevX, // Will be updated after undo applies
                prevY: op.prevY,
            };
        }

        case OpCode.UpdateRotation: {
            if (!entity || !entity.isAlive()) return null;
            const rot = entity.get(Rotation);
            if (!rot) return null;
            return {
                op: OpCode.UpdateRotation,
                id: op.id,
                seq: 0,
                angle: rot.angle,
                prevAngle: op.prevAngle, // Will be updated after undo applies
            };
        }

        case OpCode.UpdateScale: {
            if (!entity || !entity.isAlive()) return null;
            const scale = entity.get(Scale);
            if (!scale) return null;
            return {
                op: OpCode.UpdateScale,
                id: op.id,
                seq: 0,
                x: scale.x,
                y: scale.y,
                prevX: op.prevX, // Will be updated after undo applies
                prevY: op.prevY,
            };
        }

        case OpCode.UpdateColor: {
            if (!entity || !entity.isAlive()) return null;
            const color = entity.get(Color);
            if (!color) return null;
            return {
                op: OpCode.UpdateColor,
                id: op.id,
                seq: 0,
                fill: color.fill,
                prevFill: op.prevFill, // Will be updated after undo applies
            };
        }
    }
}
