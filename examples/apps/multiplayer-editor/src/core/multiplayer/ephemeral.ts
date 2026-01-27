import type {
    EphemeralPresence,
    ClientEphemeralMessage,
    EditStart,
    EditUpdate,
    EditEnd,
} from './protocol';

type SendFunction = (message: ClientEphemeralMessage) => void;

let sendFn: SendFunction | null = null;
let clientId: string = '';

// Throttle state for presence
const THROTTLE_MS = 33; // ~30fps
let lastPresenceTime = 0;
let pendingPresence: EphemeralPresence | null = null;
let presenceTimerId: ReturnType<typeof setTimeout> | null = null;

export function setEphemeralSender(id: string, send: SendFunction | null) {
    clientId = id;
    sendFn = send;
}

export function sendEphemeralPresence(
    cursor: { x: number; y: number } | null,
    selection: number[],
    name?: string
) {
    if (!sendFn || !clientId) return;

    const presence: EphemeralPresence = name
        ? { type: 'presence', name, cursor, selection }
        : { type: 'presence', cursor, selection };
    const now = Date.now();

    if (now - lastPresenceTime >= THROTTLE_MS) {
        // Send immediately
        lastPresenceTime = now;
        sendFn({ type: 'client-ephemeral', clientId, data: presence });
        pendingPresence = null;
    } else {
        // Queue for later
        pendingPresence = presence;
        if (!presenceTimerId) {
            const delay = THROTTLE_MS - (now - lastPresenceTime);
            presenceTimerId = setTimeout(() => {
                presenceTimerId = null;
                if (pendingPresence && sendFn && clientId) {
                    lastPresenceTime = Date.now();
                    sendFn({ type: 'client-ephemeral', clientId, data: pendingPresence });
                    pendingPresence = null;
                }
            }, delay);
        }
    }
}

// Editing protocol - sends absolute values

export function sendEditStart(data: Omit<EditStart, 'type'>) {
    if (!sendFn || !clientId) return;
    const message: EditStart = { type: 'editStart', ...data };
    sendFn({ type: 'client-ephemeral', clientId, data: message });
}

// Throttle state for edit updates
let lastEditUpdateTime = 0;
let pendingEditUpdate: EditUpdate | null = null;
let editUpdateTimerId: ReturnType<typeof setTimeout> | null = null;

export function sendEditUpdate(data: Omit<EditUpdate, 'type'>) {
    if (!sendFn || !clientId) return;

    const message: EditUpdate = { type: 'editUpdate', ...data };
    const now = Date.now();

    if (now - lastEditUpdateTime >= THROTTLE_MS) {
        // Send immediately
        lastEditUpdateTime = now;
        sendFn({ type: 'client-ephemeral', clientId, data: message });
        pendingEditUpdate = null;
    } else {
        // Queue for later
        pendingEditUpdate = message;
        if (!editUpdateTimerId) {
            const delay = THROTTLE_MS - (now - lastEditUpdateTime);
            editUpdateTimerId = setTimeout(() => {
                editUpdateTimerId = null;
                if (pendingEditUpdate && sendFn && clientId) {
                    lastEditUpdateTime = Date.now();
                    sendFn({ type: 'client-ephemeral', clientId, data: pendingEditUpdate });
                    pendingEditUpdate = null;
                }
            }, delay);
        }
    }
}

export function sendEditEnd(data: Omit<EditEnd, 'type'>) {
    if (!sendFn || !clientId) return;

    // Clear pending edit updates
    if (editUpdateTimerId) {
        clearTimeout(editUpdateTimerId);
        editUpdateTimerId = null;
    }
    pendingEditUpdate = null;

    const message: EditEnd = { type: 'editEnd', ...data };
    sendFn({ type: 'client-ephemeral', clientId, data: message });
}
