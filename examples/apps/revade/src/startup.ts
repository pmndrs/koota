import { useActions } from 'koota/react';
import { useEffect } from 'react';
import { actions } from './actions';
import { Movement } from './traits';

export function Startup() {
	const { spawnPlayer, destroyAllEnemies } = useActions(actions);

	useEffect(() => {
		const player = spawnPlayer();
		player.set(Movement, { maxSpeed: 50, damping: 0.99, thrust: 2 });

		return () => {
			player?.destroy();
			destroyAllEnemies();
		};
	}, [spawnPlayer, destroyAllEnemies]);

	return null;
}
