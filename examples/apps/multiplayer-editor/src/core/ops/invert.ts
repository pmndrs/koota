import type { Op } from './types';
import { OpCode } from './types';

export function invertOp(op: Op): Op {
    switch (op.op) {
        case OpCode.CreateShape:
            return {
                op: OpCode.DeleteShape,
                id: op.id,
                seq: op.seq,
                shape: op.shape,
                x: op.x,
                y: op.y,
                color: op.color,
                rotation: op.rotation,
                scaleX: op.scaleX,
                scaleY: op.scaleY,
            };

        case OpCode.DeleteShape:
            return {
                op: OpCode.CreateShape,
                id: op.id,
                seq: op.seq,
                shape: op.shape,
                x: op.x,
                y: op.y,
                color: op.color,
                rotation: op.rotation,
                scaleX: op.scaleX,
                scaleY: op.scaleY,
            };

        case OpCode.UpdatePosition:
            return {
                op: OpCode.UpdatePosition,
                id: op.id,
                seq: op.seq,
                x: op.prevX,
                y: op.prevY,
                prevX: op.x,
                prevY: op.y,
            };

        case OpCode.UpdateRotation:
            return {
                op: OpCode.UpdateRotation,
                id: op.id,
                seq: op.seq,
                angle: op.prevAngle,
                prevAngle: op.angle,
            };

        case OpCode.UpdateScale:
            return {
                op: OpCode.UpdateScale,
                id: op.id,
                seq: op.seq,
                x: op.prevX,
                y: op.prevY,
                prevX: op.x,
                prevY: op.y,
            };

        case OpCode.UpdateColor:
            return {
                op: OpCode.UpdateColor,
                id: op.id,
                seq: op.seq,
                fill: op.prevFill,
                prevFill: op.fill,
            };
    }
}
