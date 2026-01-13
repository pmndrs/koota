import { awareness } from './doc';

export type PresenceState = {
	name: string;
	color: string;
	selectedShapeId: string | null;
};

// Random color for this user
const userColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
const userName = `User-${Math.random().toString(36).slice(2, 6)}`;

// Set initial presence
awareness.setLocalState({
	name: userName,
	color: userColor,
	selectedShapeId: null,
} satisfies PresenceState);

/**
 * Update local user's selected shape
 */
export function setSelectedShape(shapeId: string | null): void {
	const current = awareness.getLocalState() as PresenceState | null;
	awareness.setLocalState({
		...current,
		name: current?.name ?? userName,
		color: current?.color ?? userColor,
		selectedShapeId: shapeId,
	});
}

/**
 * Get all remote users' presence states
 */
export function getRemotePresence(): Map<number, PresenceState> {
	const states = new Map<number, PresenceState>();
	awareness.getStates().forEach((state: PresenceState | null, clientId: number) => {
		if (clientId !== awareness.clientID && state) {
			states.set(clientId, state);
		}
	});
	return states;
}

/**
 * Subscribe to presence changes
 */
export function onPresenceChange(callback: () => void): () => void {
	awareness.on('change', callback);
	return () => awareness.off('change', callback);
}

export { awareness };
