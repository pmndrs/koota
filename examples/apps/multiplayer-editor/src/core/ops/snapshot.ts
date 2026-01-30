import type { World, Entity } from 'koota';
import type { Op } from '../types';
import { OpCode } from '../types';
import { History, Position, Rotation, Scale, Color, Shape, IsTombstoned, StableId } from '../traits';
import { isActive } from '../utils/shape-helpers';

function captureLifecycleSnapshot(entity: Entity | undefined, fallbackId: number): Op | null {
    if (!entity || !entity.isAlive()) return null;

    const pos = entity.get(Position);
    const rot = entity.get(Rotation);
    const scale = entity.get(Scale);
    const color = entity.get(Color);
    const shape = entity.get(Shape);

    if (!pos || !rot || !scale || !color || !shape) return null;

    const stableId = entity.get(StableId);
    const id = stableId?.id ?? fallbackId;

    if (entity.has(IsTombstoned)) {
        return {
            op: OpCode.DeleteShape,
            id,
            seq: 0,
            shape: shape.type,
            x: pos.x,
            y: pos.y,
            rotation: rot.angle,
            scaleX: scale.x,
            scaleY: scale.y,
            color: { r: color.r, g: color.g, b: color.b },
        };
    }

    return {
        op: OpCode.CreateShape,
        id,
        seq: 0,
        shape: shape.type,
        x: pos.x,
        y: pos.y,
        rotation: rot.angle,
        scaleX: scale.x,
        scaleY: scale.y,
        color: { r: color.r, g: color.g, b: color.b },
    };
}

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
        case OpCode.CreateShape:
        case OpCode.DeleteShape: {
            // For lifecycle ops, snapshot based on current entity state (not op type).
            return captureLifecycleSnapshot(entity, op.id);
        }

        case OpCode.UpdatePosition: {
            if (!isActive(entity)) return null;
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
            if (!isActive(entity)) return null;
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
            if (!isActive(entity)) return null;
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
            if (!isActive(entity)) return null;
            const color = entity.get(Color);
            if (!color) return null;
            return {
                op: OpCode.UpdateColor,
                id: op.id,
                seq: 0,
                r: color.r,
                g: color.g,
                b: color.b,
                prevR: op.prevR, // Will be updated after undo applies
                prevG: op.prevG,
                prevB: op.prevB,
            };
        }
    }
}
