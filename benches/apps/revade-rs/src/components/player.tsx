import { useActions } from 'koota/react';
import { actions } from '../actions';
import { useEffect, useState } from 'react';
import { Entity } from 'koota';

export function Player() {
	const [player, setPlayer] = useState<Entity | null>(null);
	const { spawnPlayer } = useActions(actions);

	useEffect(() => {
		const player = spawnPlayer();
		setPlayer(player);

		return () => {
			player.destroy();
			setPlayer(null);
		};
	}, [spawnPlayer]);

	return player && <PlayerRenderer entity={player} />;
}

export function PlayerRenderer({ entity }: { entity: Entity }) {
	return (
		<mesh>
			<boxGeometry />
			<meshBasicMaterial color="orange" wireframe />
		</mesh>
	);
}
