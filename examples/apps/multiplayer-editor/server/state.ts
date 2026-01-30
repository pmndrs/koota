import type { Op, RGB } from '../src/core/types';
import { OpCode } from '../src/core/types';
import type { Checkpoint } from '../src/core/multiplayer/protocol';

export type ShapeState = {
    id: number;
    type: 'rect' | 'ellipse';
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    color: RGB;
};

export type ServerState = {
    seq: number;
    shapes: Map<number, ShapeState>;
    checkpoint: Checkpoint;
    journal: Op[];
};

export function createServerState(): ServerState {
    return {
        seq: 0,
        shapes: new Map(),
        checkpoint: { seq: 0, shapes: [] },
        journal: [],
    };
}

export function applyOpToState(state: ServerState, op: Op): string | null {
    switch (op.op) {
        case OpCode.CreateShape: {
            if (state.shapes.has(op.id)) {
                return `Shape ${op.id} already exists`;
            }
            state.shapes.set(op.id, {
                id: op.id,
                type: op.shape,
                x: op.x,
                y: op.y,
                rotation: op.rotation,
                scaleX: op.scaleX,
                scaleY: op.scaleY,
                color: op.color,
            });
            return null;
        }

        case OpCode.DeleteShape: {
            if (!state.shapes.has(op.id)) {
                return `Shape ${op.id} does not exist`;
            }
            state.shapes.delete(op.id);
            return null;
        }

        case OpCode.UpdatePosition: {
            const shape = state.shapes.get(op.id);
            if (!shape) return `Shape ${op.id} does not exist`;
            shape.x = op.x;
            shape.y = op.y;
            return null;
        }

        case OpCode.UpdateRotation: {
            const shape = state.shapes.get(op.id);
            if (!shape) return `Shape ${op.id} does not exist`;
            shape.rotation = op.angle;
            return null;
        }

        case OpCode.UpdateScale: {
            const shape = state.shapes.get(op.id);
            if (!shape) return `Shape ${op.id} does not exist`;
            shape.scaleX = op.x;
            shape.scaleY = op.y;
            return null;
        }

        case OpCode.UpdateColor: {
            const shape = state.shapes.get(op.id);
            if (!shape) return `Shape ${op.id} does not exist`;
            shape.color = { r: op.r, g: op.g, b: op.b };
            return null;
        }
    }
}

export function createCheckpoint(state: ServerState): Checkpoint {
    const shapes = Array.from(state.shapes.values())
        .sort((a, b) => a.id - b.id)
        .map((shape) => ({
            id: shape.id,
            type: shape.type,
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation,
            scaleX: shape.scaleX,
            scaleY: shape.scaleY,
            color: shape.color,
        }));

    return { seq: state.seq, shapes };
}

export function recordCheckpoint(state: ServerState) {
    state.checkpoint = createCheckpoint(state);
    state.journal = [];
}
