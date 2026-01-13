import { WebSocketServer, WebSocket } from 'ws';
import { createWorld } from 'koota';
import type { Op, SpawnShapePayload, ClientMessage, ServerMessage } from '../src/shared/protocol';
import { opDefs } from '../src/shared/ops';
import { createNetIdMap, registerNetIdMapping, type NetIdMap } from '../src/shared/net-id-map';
import { NetID, ShapeType, Position, Rotation, Scale, Color } from '../src/traits';

// Server state
const world = createWorld();
const netIds: NetIdMap = createNetIdMap();
let serverSeq = 0;

// Register NetID mapping via shared utility
registerNetIdMapping(world, netIds);

// Track connected clients
const clients = new Map<WebSocket, { clientId: string | null }>();
const presence = new Map<string, { color: string; selectedNetId: string | null }>();

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });

console.log('🚀 Multiplayer Editor Server running on ws://localhost:8080');

wss.on('connection', (ws) => {
    console.log('📥 Client connected');
    clients.set(ws, { clientId: null });

    // Send snapshot to new client
    const snapshot = createSnapshot();
    send(ws, snapshot);

    // Send current presence of all other clients
    for (const [clientId, data] of presence) {
        send(ws, {
            type: 'presence',
            clientId,
            color: data.color,
            selectedNetId: data.selectedNetId,
        });
    }

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString()) as ClientMessage;
            handleMessage(ws, msg);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        const clientData = clients.get(ws);
        if (clientData?.clientId) {
            presence.delete(clientData.clientId);
            // Notify all clients that this user left
            broadcast({
                type: 'clientLeft',
                clientId: clientData.clientId,
            });
        }
        clients.delete(ws);
        console.log('📤 Client disconnected');
    });
});

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
    if (msg.type === 'op') {
        handleOp(ws, msg.op);
    } else if (msg.type === 'presence') {
        handlePresence(ws, msg);
    }
}

function handleOp(ws: WebSocket, op: Op): void {
    // Validate op
    const validation = validateOp(op);
    if (!validation.valid) {
        console.warn(`❌ Op rejected: ${op.type} ${op.netId} - ${validation.reason}`);
        send(ws, {
            type: 'reject',
            opId: op.id,
            reason: validation.reason!,
        });
        return;
    }

    // Assign server sequence
    op.serverSeq = serverSeq++;

    // Apply to authoritative world
    const def = opDefs[op.type];
    if (def) {
        def.apply(world, netIds, op.payload, op.netId);
    }

    console.log(`✅ Op ${op.type} seq=${op.serverSeq} netId=${op.netId.slice(0, 8)}`);

    // Broadcast to all clients (including sender for ack)
    broadcast({ type: 'op', op });
}

function handlePresence(
    ws: WebSocket,
    msg: { type: 'presence'; clientId: string; color: string; selectedNetId: string | null }
): void {
    // Store client ID for disconnect handling
    const clientData = clients.get(ws);
    if (clientData) {
        clientData.clientId = msg.clientId;
    }

    // Store and broadcast presence
    presence.set(msg.clientId, {
        color: msg.color,
        selectedNetId: msg.selectedNetId,
    });

    // Broadcast to other clients (exclude sender)
    broadcast(msg, ws);
}

interface ValidationResult {
    valid: boolean;
    reason?: string;
}

function validateOp(op: Op): ValidationResult {
    // Basic validation
    if (!op.id) {
        return { valid: false, reason: 'Missing op id' };
    }
    if (!op.type) {
        return { valid: false, reason: 'Missing op type' };
    }
    if (!op.clientId) {
        return { valid: false, reason: 'Missing client id' };
    }

    // For set* and delete ops, entity must exist
    if (op.type !== 'spawnShape') {
        const entity = netIds.toEntity.get(op.netId);
        if (!entity || !entity.isAlive()) {
            return { valid: false, reason: `Entity ${op.netId.slice(0, 8)} not found` };
        }
    }

    // For spawnShape, netId must not already exist
    if (op.type === 'spawnShape') {
        if (netIds.toEntity.has(op.netId)) {
            return { valid: false, reason: `Entity ${op.netId.slice(0, 8)} already exists` };
        }
    }

    return { valid: true };
}

function createSnapshot(): ServerMessage {
    const shapes: SpawnShapePayload[] = [];

    // Query all shapes
    for (const entity of world.query(NetID, ShapeType, Position, Rotation, Scale, Color)) {
        const netId = entity.get(NetID)!;
        const shapeType = entity.get(ShapeType)!;
        const position = entity.get(Position)!;
        const rotation = entity.get(Rotation)!;
        const scale = entity.get(Scale)!;
        const color = entity.get(Color)!;

        shapes.push({
            netId: netId.id,
            shapeType: shapeType.type,
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
            scale: { x: scale.x, y: scale.y, z: scale.z },
            color: color.value,
        });
    }

    return {
        type: 'snapshot',
        shapes,
        serverSeq,
    };
}

function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function broadcast(msg: ServerMessage, exclude?: WebSocket): void {
    for (const [ws] of clients) {
        if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }
}
