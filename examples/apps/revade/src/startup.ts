import { useActions } from 'koota/react';
import { useEffect } from 'react';
import { actions } from './actions';
import { Movement } from './traits';
import * as THREE from 'three';

export function Startup() {
    const { spawnPlayer, destroyAllEnemies } = useActions(actions);

    useEffect(() => {
        const player = spawnPlayer();
        player.set(Movement, { velocity: new THREE.Vector3(), force: new THREE.Vector3(), maxSpeed: 50, damping: 0.99, thrust: 2 });

        return () => {
            player?.destroy();
            destroyAllEnemies();
        };
    }, [spawnPlayer, destroyAllEnemies]);

    return null;
}
