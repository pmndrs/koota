import type { EphemeralPresence, ClientEphemeralMessage } from './protocol';

type SendFunction = (message: ClientEphemeralMessage) => void;

let sendFn: SendFunction | null = null;
let clientId: string = '';

// Throttle state
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

export function clearEphemeralPresence() {
    if (presenceTimerId) {
        clearTimeout(presenceTimerId);
        presenceTimerId = null;
    }
    pendingPresence = null;
}
