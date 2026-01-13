import { useSyncClient } from '../sync/sync-context';
import { useState, useEffect } from 'react';

export function StatusBar() {
	const syncClient = useSyncClient();
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		const interval = setInterval(() => {
			setConnected(syncClient.isConnected);
		}, 500);
		return () => clearInterval(interval);
	}, [syncClient]);

	return (
		<div className="status-bar">
			<div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
			<span>{connected ? 'Connected' : 'Disconnected'}</span>
			<span style={{ marginLeft: 8, color: syncClient.clientColor }}>
				You: {syncClient.clientId.slice(0, 8)}
			</span>
		</div>
	);
}
