import type { Op } from '../ops/types';

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

export type ServerWelcomeMessage = {
    type: 'welcome';
    clientId: string;
    idBase: number;
    checkpoint: Checkpoint;
    ops: ServerOp[];
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

export type ClientMessage = ClientHelloMessage | ClientOpsMessage;
export type ServerMessage =
    | ServerWelcomeMessage
    | ServerOpsMessage
    | ServerRejectMessage
    | ServerCorrectionMessage;
