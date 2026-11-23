import { useActions, useWorld } from 'koota/react';
import { useEffect } from 'react';
import { actions } from './actions';
import { Movement } from './traits';

export function Startup() {
  const world = useWorld();
  const { spawnPlayer, destroyAllEnemies } = useActions(actions);

  useEffect(() => {
    const player = spawnPlayer();
    world.set(player, Movement, { maxSpeed: 50, damping: 0.99, thrust: 2 });

    return () => {
      world.destroy(player);
      destroyAllEnemies();
    };
  }, [world, spawnPlayer, destroyAllEnemies]);

  return null;
}
