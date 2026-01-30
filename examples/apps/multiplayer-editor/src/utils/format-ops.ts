import { OpCode, type Op } from '../core/types';

export function formatOpCode(code: OpCode): string {
    switch (code) {
        case OpCode.CreateShape:
            return 'Create';
        case OpCode.DeleteShape:
            return 'Delete';
        case OpCode.UpdatePosition:
            return 'Move';
        case OpCode.UpdateRotation:
            return 'Rotate';
        case OpCode.UpdateScale:
            return 'Scale';
        case OpCode.UpdateColor:
            return 'Color';
        default:
            return 'Unknown';
    }
}

export function formatOp(op: Op): string {
    const base = `[${op.seq}] ${formatOpCode(op.op)} #${op.id}`;

    switch (op.op) {
        case OpCode.CreateShape:
            return `${base} (${op.shape} at ${op.x.toFixed(0)},${op.y.toFixed(0)})`;
        case OpCode.DeleteShape:
            return `${base} (${op.shape})`;
        case OpCode.UpdatePosition:
            return `${base} (${op.x.toFixed(0)},${op.y.toFixed(0)})`;
        case OpCode.UpdateRotation:
            return `${base} (${op.angle.toFixed(0)}°)`;
        case OpCode.UpdateScale:
            return `${base} (${op.x.toFixed(2)},${op.y.toFixed(2)})`;
        case OpCode.UpdateColor:
            return `${base} (rgb(${op.r},${op.g},${op.b}))`;
        default:
            return base;
    }
}
