import { useWorld } from 'koota/react';
import { useEffect, useState } from 'react';
import { trait } from 'koota';
import { createSyncClient } from './sync/sync-client';

// World trait to hold sync client reference
export const SyncClientRef = trait(() => null! as ReturnType<typeof createSyncClient>);

interface StartupProps {
	children: React.ReactNode;
}

/**
 * Startup initializes the sync client and connects to the server.
 * Children only render after initialization is complete.
 */
export function Startup({ children }: StartupProps) {
	const world = useWorld();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const client = createSyncClient(world, crypto.randomUUID());

		// Connect to WebSocket server
		const ws = new WebSocket('ws://localhost:8080');

		ws.onopen = () => {
			client.connect(
				(msg) => ws.send(JSON.stringify(msg)),
				() => ws.readyState === WebSocket.OPEN
			);
		};

		ws.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			client.receive(msg);
		};

		ws.onclose = () => {
			client.disconnect();
		};

		// Store in world and signal ready
		world.add(SyncClientRef(client));
		setReady(true);

		return () => {
			ws.close();
			client.destroy();
			world.remove(SyncClientRef);
		};
	}, [world]);

	if (!ready) return null;

	return <>{children}</>;
}
