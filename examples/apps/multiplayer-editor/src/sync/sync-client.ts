import type { World, Entity } from 'koota';
import type {
    Op,
    OpType,
    OpPayload,
    ServerMessage,
    ClientMessage,
    SnapshotMessage,
    PresenceMessage,
    RejectMessage,
    ClientLeftMessage,
} from '../shared/protocol';
import { opDefs, getConflictKey, captureEntityState } from '../shared/ops';
import { createNetIdMap, registerNetIdMapping, type NetIdMap } from '../shared/net-id-map';
import { EditorStatus, Presence } from '../traits';
import { createUndoManager, type UndoManager } from './undo-manager';

// Coalescing throttle interval (ms)
const SEND_THROTTLE_MS = 33; // ~30 Hz

export function createSyncClient(world: World, clientId: string) {
    const netIds: NetIdMap = createNetIdMap();
    const undoManager: UndoManager = createUndoManager();

    // Register NetID mapping via shared utility
    const unregisterNetIdMapping = registerNetIdMapping(world, netIds);

    // Pending ops by id (awaiting server ack)
    const pending = new Map<string, Op>();
    // Pending ops by conflict key for anti-flicker
    const pendingByKey = new Map<string, Op>();
    // Deferred remote ops (blocked by anti-flicker)
    const deferred = new Map<string, Op>();

    // Connection state
    let sendFn: ((msg: ClientMessage) => void) | null = null;
    let isConnectedFn: (() => boolean) | null = null;
    let connected = false;
    let _lastServerSeq = 0;
    let clientSeq = 0;

    // Coalescing state
    const coalescedOps = new Map<string, Op>();
    let sendTimer: ReturnType<typeof setTimeout> | null = null;

    // Presence state
    const clientColor = generateClientColor(clientId);
    let localSelectedNetId: string | null = null;

    function updateEditorStatus(): void {
        // Keep EditorStatus as the single reactive source of truth for UI enablement.
        // This avoids polling and makes undo/redo buttons update immediately.
        world.set(EditorStatus, {
            connected: connected && (isConnectedFn?.() ?? false),
            canUndo: undoManager.canUndo(),
            canRedo: undoManager.canRedo(),
        });
    }

    // --- Internal helpers ---

    function applyOp(op: Op): void {
        const def = opDefs[op.type];
        if (def) {
            def.apply(world, netIds, op.payload, op.netId);
        }
    }

    function getInverse(op: Op): Op | null {
        const def = opDefs[op.type];
        if (!def) return null;

        // For deleteShape, capture state BEFORE applying
        if (op.type === 'deleteShape') {
            const state = captureEntityState(netIds, op.netId);
            if (!state) return null;
            return {
                id: '',
                type: 'spawnShape',
                netId: op.netId,
                payload: {
                    netId: op.netId,
                    shapeType: state.shapeType!,
                    position: state.position!,
                    rotation: state.rotation!,
                    scale: state.scale!,
                    color: state.color!,
                },
                clientSeq: 0,
                clientId,
                timestamp: 0,
            };
        }

        return def.invert(world, netIds, op.payload, op.netId);
    }

    function scheduleSend(): void {
        if (sendTimer || !connected) return;
        sendTimer = setTimeout(flushCoalesced, SEND_THROTTLE_MS);
    }

    function flushCoalesced(): void {
        sendTimer = null;
        if (!sendFn || !connected) return;

        for (const op of coalescedOps.values()) {
            sendFn({ type: 'op', op });
        }
        coalescedOps.clear();
    }

    function cleanupPendingOp(opId: string): void {
        const op = pending.get(opId);
        if (!op) return;

        pending.delete(opId);
        const conflictKey = getConflictKey(op);
        if (conflictKey && pendingByKey.get(conflictKey)?.id === opId) {
            pendingByKey.delete(conflictKey);

            // Apply any deferred remote op for this key
            const deferredOp = deferred.get(conflictKey);
            if (deferredOp) {
                deferred.delete(conflictKey);
                applyOp(deferredOp);
            }
        }
    }

    // --- Public API ---

    function dispatch(
        type: OpType,
        payload: OpPayload,
        netId: string,
        options: { gestureId?: string; skipUndo?: boolean } = {}
    ): Op {
        const op: Op = {
            id: crypto.randomUUID(),
            type,
            netId,
            payload,
            clientSeq: clientSeq++,
            clientId,
            timestamp: Date.now(),
            gestureId: options.gestureId,
        };

        // Get inverse BEFORE applying (important for delete)
        const inverse = options.skipUndo ? null : getInverse(op);

        // 1. Apply locally (optimistic)
        applyOp(op);

        // 2. Track pending
        pending.set(op.id, op);
        const conflictKey = getConflictKey(op);
        if (conflictKey) {
            pendingByKey.set(conflictKey, op);
        }

        // 3. Push to undo stack
        if (!options.skipUndo && inverse) {
            undoManager.push({ original: op, inverse });
            updateEditorStatus();
        }

        // 4. Send (with coalescing for property ops)
        if (conflictKey) {
            coalescedOps.set(conflictKey, op);
            scheduleSend();
        } else {
            // Structural ops send immediately
            if (sendFn && connected) {
                sendFn({ type: 'op', op });
            }
        }

        return op;
    }

    function receive(msg: ServerMessage): void {
        switch (msg.type) {
            case 'snapshot':
                handleSnapshot(msg);
                break;
            case 'op':
                handleOp(msg.op);
                break;
            case 'presence':
                handlePresence(msg);
                break;
            case 'reject':
                handleReject(msg);
                break;
            case 'clientLeft':
                handleClientLeft(msg);
                break;
        }
    }

    function handleSnapshot(msg: SnapshotMessage): void {
        // Clear existing shapes
        for (const entity of netIds.toEntity.values()) {
            if (entity.isAlive()) {
                entity.destroy();
            }
        }
        netIds.toEntity.clear();
        netIds.toNetId.clear();

        // Spawn shapes from snapshot
        for (const shape of msg.shapes) {
            opDefs.spawnShape.apply(world, netIds, shape, shape.netId);
        }

        // Clear pending and undo state (fresh start)
        pending.clear();
        pendingByKey.clear();
        deferred.clear();
        coalescedOps.clear();
        _lastServerSeq = msg.serverSeq;
        undoManager.clear();
        updateEditorStatus();
    }

    function handleOp(op: Op): void {
        // Is this our own op being acknowledged?
        if (pending.has(op.id)) {
            cleanupPendingOp(op.id);
        } else {
            // Remote op
            const conflictKey = getConflictKey(op);

            // Anti-flicker: defer if we have a pending op for this key
            if (conflictKey && pendingByKey.has(conflictKey)) {
                deferred.set(conflictKey, op);
            } else {
                applyOp(op);
            }
        }

        if (op.serverSeq !== undefined) {
            _lastServerSeq = op.serverSeq;
        }
    }

    function handleReject(msg: RejectMessage): void {
        console.warn(`Op rejected: ${msg.opId} - ${msg.reason}`);

        const op = pending.get(msg.opId);
        if (!op) return;

        // Rollback: apply the inverse of what we optimistically applied
        const inverse = getInverse(op);
        if (inverse) {
            applyOp(inverse);
        }

        cleanupPendingOp(msg.opId);
        updateEditorStatus();

        // TODO: Could notify UI of the rejection
    }

    function handlePresence(msg: PresenceMessage): void {
        if (msg.clientId === clientId) return;

        // Find or create presence entity for this client
        const existing = world.query(Presence).find((e) => {
            const p = e.get(Presence);
            return p?.clientId === msg.clientId;
        });

        if (existing) {
            existing.set(Presence, {
                clientId: msg.clientId,
                color: msg.color,
                selectedNetId: msg.selectedNetId,
            });
        } else {
            world.spawn(
                Presence({
                    clientId: msg.clientId,
                    color: msg.color,
                    selectedNetId: msg.selectedNetId,
                })
            );
        }
    }

    function handleClientLeft(msg: ClientLeftMessage): void {
        // Remove presence entity for disconnected client
        const existing = world.query(Presence).find((e) => {
            const p = e.get(Presence);
            return p?.clientId === msg.clientId;
        });

        if (existing && existing.isAlive()) {
            existing.destroy();
        }
    }

    function broadcastPresence(): void {
        if (!sendFn || !connected) return;
        sendFn({
            type: 'presence',
            clientId,
            color: clientColor,
            selectedNetId: localSelectedNetId,
        });
    }

    function setSelection(netId: string | null): void {
        localSelectedNetId = netId;
        broadcastPresence();
    }

    function undo(): void {
        const entries = undoManager.undo();
        if (!entries) return;

        // Apply inverse ops in reverse order
        for (let i = entries.length - 1; i >= 0; i--) {
            const { inverse } = entries[i];
            dispatch(inverse.type, inverse.payload, inverse.netId, { skipUndo: true });
        }
        updateEditorStatus();
    }

    function redo(): void {
        const entries = undoManager.redo();
        if (!entries) return;

        // Re-apply the original ops
        for (const { original } of entries) {
            dispatch(original.type, original.payload, original.netId, { skipUndo: true });
        }
        updateEditorStatus();
    }

    function connect(send: (msg: ClientMessage) => void, isConnected: () => boolean): void {
        sendFn = send;
        isConnectedFn = isConnected;
        connected = true;
        broadcastPresence();
        updateEditorStatus();
    }

    function disconnect(): void {
        connected = false;
        sendFn = null;
        isConnectedFn = null;
        if (sendTimer) {
            clearTimeout(sendTimer);
            sendTimer = null;
        }
        updateEditorStatus();
    }

    function destroy(): void {
        disconnect();
        unregisterNetIdMapping();
    }

    return {
        clientId,
        clientColor,
        netIds,

        connect,
        disconnect,
        destroy,

        get isConnected() {
            return connected && (isConnectedFn?.() ?? false);
        },

        dispatch,
        receive,

        setSelection,
        getSelection: () => localSelectedNetId,

        undo,
        redo,
        canUndo: () => undoManager.canUndo(),
        canRedo: () => undoManager.canRedo(),

        getEntity: (netId: string) => netIds.toEntity.get(netId),
        getNetId: (entity: Entity) => netIds.toNetId.get(entity),
    };
}

// Generate a consistent color from client ID
function generateClientColor(clientId: string): string {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
        hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 60%)`;
}
