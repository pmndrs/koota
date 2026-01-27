import { WebSocketServer, type WebSocket } from 'ws';
import type {
    ClientMessage,
    ClientOpsMessage,
    ClientEphemeralMessage,
    ServerMessage,
    ServerOp,
    EphemeralPresence,
    EphemeralSnapshot,
} from '../src/core/multiplayer/protocol';
import { createServerState, applyOpToState, recordCheckpoint } from './state';
import { appendToJournal } from './journal';
import { SEQ_UNASSIGNED } from '../src/core/types';

type ClientInfo = {
    id: string;
    idBase: number;
};

type ClientEphemeralState = {
    presence?: EphemeralPresence;
};

const ephemeralState = new Map<string, ClientEphemeralState>();

const PORT = Number(process.env.MP_PORT ?? 8787);
const CHECKPOINT_INTERVAL_MS = 30_000;
const ID_BLOCK_SIZE = 1_000_000;

const state = createServerState();
const wss = new WebSocketServer({ port: PORT });
const clients = new Map<WebSocket, ClientInfo>();

let nextClientIndex = 1;

setInterval(() => {
    recordCheckpoint(state);
}, CHECKPOINT_INTERVAL_MS);

wss.on('connection', (socket) => {
    const clientIndex = nextClientIndex++;
    const clientId = `client-${clientIndex}`;
    const idBase = clientIndex * ID_BLOCK_SIZE;

    clients.set(socket, { id: clientId, idBase });

    socket.on('message', (data) => {
        const message = parseMessage(data.toString());
        if (!message) return;
        handleMessage(socket, message);
    });

    socket.on('close', () => {
        const clientInfo = clients.get(socket);
        clients.delete(socket);

        if (clientInfo) {
            ephemeralState.delete(clientInfo.id);
            broadcastExcept(socket, { type: 'user-left', clientId: clientInfo.id });
        }
    });

    // Build ephemeral snapshot for late joiner
    const ephemeralSnapshot: EphemeralSnapshot[] = [];
    for (const [cid, ephState] of ephemeralState.entries()) {
        ephemeralSnapshot.push({
            clientId: cid,
            presence: ephState.presence,
        });
    }

    send(socket, {
        type: 'welcome',
        clientId,
        idBase,
        checkpoint: state.checkpoint,
        ops: state.journal.map((op) => ({ op })),
        ephemeral: ephemeralSnapshot,
    });
});

function handleMessage(socket: WebSocket, message: ClientMessage) {
    switch (message.type) {
        case 'hello': {
            return;
        }

        case 'client-ops': {
            handleClientOps(socket, message);
            return;
        }

        case 'client-ephemeral': {
            handleClientEphemeral(socket, message);
            return;
        }
    }
}

function handleClientEphemeral(socket: WebSocket, message: ClientEphemeralMessage) {
    const clientInfo = clients.get(socket);
    if (!clientInfo) return;

    // Update ephemeral state for this client (presence only - cursor + selection)
    let clientState = ephemeralState.get(message.clientId);
    if (!clientState) {
        clientState = {};
        ephemeralState.set(message.clientId, clientState);
    }

    clientState.presence = message.data;

    // Broadcast to all OTHER clients (not the sender)
    broadcastExcept(socket, {
        type: 'server-ephemeral',
        clientId: message.clientId,
        data: message.data,
    });
}

function handleClientOps(socket: WebSocket, message: ClientOpsMessage) {
    const accepted: ServerOp[] = [];

    if (message.baseSeq < state.checkpoint.seq) {
        send(socket, {
            type: 'correction',
            checkpoint: state.checkpoint,
            ops: state.journal.map((op) => ({ op })),
            reason: 'Client behind checkpoint',
        });
        return;
    }

    for (const clientOp of message.ops) {
        const op = { ...clientOp.op, seq: SEQ_UNASSIGNED };
        const assignedSeq = state.seq + 1;
        const opWithSeq = { ...op, seq: assignedSeq };
        const error = applyOpToState(state, opWithSeq);

        if (error) {
            send(socket, {
                type: 'reject',
                clientOpId: clientOp.clientOpId,
                reason: error,
            });
            continue;
        }

        state.seq = assignedSeq;
        appendToJournal(state, opWithSeq);
        accepted.push({
            op: opWithSeq,
            clientId: message.clientId,
            clientOpId: clientOp.clientOpId,
        });
    }

    if (accepted.length > 0) {
        broadcast({ type: 'server-ops', ops: accepted });
    }
}

function broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const socket of clients.keys()) {
        if (socket.readyState === socket.OPEN) {
            socket.send(payload);
        }
    }
}

function broadcastExcept(excludeSocket: WebSocket, message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const socket of clients.keys()) {
        if (socket !== excludeSocket && socket.readyState === socket.OPEN) {
            socket.send(payload);
        }
    }
}

function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
}

function parseMessage(raw: string): ClientMessage | null {
    try {
        return JSON.parse(raw) as ClientMessage;
    } catch {
        return null;
    }
}

// eslint-disable-next-line no-console
console.log(`Multiplayer server listening on ws://localhost:${PORT}`);
