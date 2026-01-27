import type { Op } from '../types';

export type CheckpointShape = {
    id: number;
    type: 'rect' | 'ellipse';
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    color: string;
};

export type Checkpoint = {
    seq: number;
    shapes: CheckpointShape[];
};

export type ClientOp = {
    clientOpId: string;
    op: Op;
};

export type ServerOp = {
    op: Op;
    clientId?: string;
    clientOpId?: string;
};

export type ClientHelloMessage = {
    type: 'hello';
    clientId?: string;
    lastSeq?: number;
};

export type ClientOpsMessage = {
    type: 'client-ops';
    clientId: string;
    baseSeq: number;
    ops: ClientOp[];
};

export type EphemeralSnapshot = {
    clientId: string;
    presence?: EphemeralPresence;
    transform?: EphemeralTransform;
};

export type ServerWelcomeMessage = {
    type: 'welcome';
    clientId: string;
    idBase: number;
    checkpoint: Checkpoint;
    ops: ServerOp[];
    ephemeral: EphemeralSnapshot[];
};

export type ServerOpsMessage = {
    type: 'server-ops';
    ops: ServerOp[];
};

export type ServerRejectMessage = {
    type: 'reject';
    clientOpId: string;
    reason: string;
};

export type ServerCorrectionMessage = {
    type: 'correction';
    checkpoint: Checkpoint;
    ops: ServerOp[];
    reason?: string;
};

// Ephemeral collaboration signals (not persisted, broadcast only)
export type EphemeralPresence = {
    type: 'presence';
    name?: string;
    cursor: { x: number; y: number } | null;
    selection: number[];
};

export type EphemeralTransform = {
    type: 'transform';
    shapeId: number; // Stable ID of the shape being transformed
    deltaX: number;
    deltaY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
} | null; // null clears the transform

export type EphemeralData = EphemeralPresence | EphemeralTransform;

export type ClientEphemeralMessage = {
    type: 'client-ephemeral';
    clientId: string;
    data: EphemeralData;
};

export type ServerEphemeralMessage = {
    type: 'server-ephemeral';
    clientId: string;
    data: EphemeralData;
};

export type ServerUserLeftMessage = {
    type: 'user-left';
    clientId: string;
};

export type ClientMessage = ClientHelloMessage | ClientOpsMessage | ClientEphemeralMessage;
export type ServerMessage =
    | ServerWelcomeMessage
    | ServerOpsMessage
    | ServerRejectMessage
    | ServerCorrectionMessage
    | ServerEphemeralMessage
    | ServerUserLeftMessage;
