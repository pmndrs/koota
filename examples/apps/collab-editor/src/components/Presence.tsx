import { useEffect, useState } from 'react';
import { getRemotePresence, onPresenceChange, type PresenceState } from '../collab/presence';
import { awareness, provider } from '../collab/doc';

export function Presence() {
	const [users, setUsers] = useState<Map<number, PresenceState>>(new Map());
	const [localUser, setLocalUser] = useState<PresenceState | null>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		const update = () => {
			setUsers(getRemotePresence());
			setLocalUser(awareness.getLocalState() as PresenceState | null);
		};

		const updateConnection = ({ status }: { status: string }) => {
			setConnected(status === 'connected');
		};

		update();
		// Check initial connection state
		setConnected(provider.wsconnected);
		
		const unsubPresence = onPresenceChange(update);
		provider.on('status', updateConnection);

		return () => {
			unsubPresence();
			provider.off('status', updateConnection);
		};
	}, []);

	const allUsers = [
		...(localUser ? [{ id: 'local', state: localUser, isLocal: true }] : []),
		...Array.from(users.entries()).map(([id, state]) => ({ id: String(id), state, isLocal: false })),
	];

	const peerCount = users.size;

	return (
		<div style={styles.container}>
			<div style={styles.status}>
				<div
					style={{
						...styles.dot,
						backgroundColor: connected ? '#4ade80' : '#f87171',
					}}
				/>
				<div style={styles.label}>
					{connected ? `${peerCount + 1} online` : 'Connecting...'}
				</div>
			</div>
			<div style={styles.avatars}>
				{allUsers.map(({ id, state, isLocal }) => (
					<div
						key={id}
						style={{
							...styles.avatar,
							backgroundColor: state.color,
							border: isLocal ? '2px solid white' : '2px solid transparent',
						}}
						title={isLocal ? `${state.name} (you)` : state.name}
					>
						{state.name.slice(0, 2).toUpperCase()}
					</div>
				))}
			</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		position: 'fixed',
		top: 16,
		right: 16,
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		padding: '8px 12px',
		background: 'rgba(20, 20, 35, 0.9)',
		borderRadius: 12,
		border: '1px solid rgba(255, 255, 255, 0.1)',
		backdropFilter: 'blur(10px)',
	},
	status: {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: '50%',
	},
	label: {
		fontSize: 12,
		color: 'rgba(255, 255, 255, 0.6)',
		fontFamily: 'inherit',
	},
	avatars: {
		display: 'flex',
		gap: 4,
	},
	avatar: {
		width: 28,
		height: 28,
		borderRadius: '50%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 10,
		fontWeight: 'bold',
		color: 'rgba(0, 0, 0, 0.7)',
		fontFamily: 'inherit',
	},
};
