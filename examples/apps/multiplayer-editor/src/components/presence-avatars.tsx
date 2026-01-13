import { useQuery } from 'koota/react';
import { Presence } from '../traits';

export function PresenceAvatars() {
	const presenceEntities = useQuery(Presence);

	return (
		<div className="presence-avatars">
			{presenceEntities.map((entity) => {
				const presence = entity.get(Presence);
				if (!presence || !presence.clientId) return null;

				return (
					<div
						key={presence.clientId}
						className="presence-avatar"
						style={{ backgroundColor: presence.color }}
						title={presence.clientId.slice(0, 8)}
					>
						{presence.clientId.slice(0, 2).toUpperCase()}
					</div>
				);
			})}
		</div>
	);
}
