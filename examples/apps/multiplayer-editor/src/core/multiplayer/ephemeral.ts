import type { EphemeralPresence, EphemeralTransform, ClientEphemeralMessage } from './protocol';

type SendFunction = (message: ClientEphemeralMessage) => void;

let sendFn: SendFunction | null = null;
let clientId: string = '';

// Throttle state for presence
const THROTTLE_MS = 33; // ~30fps
let lastPresenceTime = 0;
let pendingPresence: EphemeralPresence | null = null;
let presenceTimerId: ReturnType<typeof setTimeout> | null = null;

// Throttle state for transforms
let lastTransformTime = 0;
let pendingTransform: EphemeralTransform | null = null;
let transformTimerId: ReturnType<typeof setTimeout> | null = null;

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

export function clearEphemeralPresence() {
    if (presenceTimerId) {
        clearTimeout(presenceTimerId);
        presenceTimerId = null;
    }
    pendingPresence = null;
}

export function sendEphemeralTransform(transform: EphemeralTransform) {
    if (!sendFn || !clientId) return;

    const now = Date.now();

    if (now - lastTransformTime >= THROTTLE_MS) {
        // Send immediately
        lastTransformTime = now;
        sendFn({ type: 'client-ephemeral', clientId, data: transform });
        pendingTransform = null;
    } else {
        // Queue for later
        pendingTransform = transform;
        if (!transformTimerId) {
            const delay = THROTTLE_MS - (now - lastTransformTime);
            transformTimerId = setTimeout(() => {
                transformTimerId = null;
                if (pendingTransform !== null && sendFn && clientId) {
                    lastTransformTime = Date.now();
                    sendFn({ type: 'client-ephemeral', clientId, data: pendingTransform });
                    pendingTransform = null;
                }
            }, delay);
        }
    }
}

export function clearEphemeralTransform() {
    if (transformTimerId) {
        clearTimeout(transformTimerId);
        transformTimerId = null;
    }
    // Send null to clear the transform on server/other clients
    if (sendFn && clientId) {
        sendFn({ type: 'client-ephemeral', clientId, data: null });
    }
    pendingTransform = null;
}
