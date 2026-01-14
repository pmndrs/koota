import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { useAnimationFrame } from './utils/use-animation-frame';
import { applyInput } from './systems/apply-input';
import { cleanupSpatialHashMap } from './systems/cleanup-spatial-hash-map';
import { dampPlayerMovement } from './systems/damp-player-movement';
import { followPlayer } from './systems/follow-player';
import { handleShooting } from './systems/handle-shooting';
import { pollKeyboard } from './systems/poll-keyboard';
import { pushEnemies } from './systems/push-enemies';
import { spawnEnemies } from './systems/spawn-enemies';
import { tickExplosion } from './systems/tick-explosion';
import { tickShieldVisibility } from './systems/tick-shield-visibility';
import { updateAutoRotate } from './systems/update-auto-rotate';
import { updateAvoidance } from './systems/update-avoidance';
import { updateBullets } from './systems/update-bullet';
import { updateBulletCollisions } from './systems/update-bullet-collisions';
import { updateMovement } from './systems/update-movement';
import { updateSpatialHashing } from './systems/update-spatial-hashing';
import { updateTime } from './systems/update-time';
import { Keyboard } from './traits';

export function Frameloop() {
    const world = useWorld();

    // Run our frameloop!
    useAnimationFrame(() => {
        updateTime(world);
        pollKeyboard(world);
        spawnEnemies(world);
        followPlayer(world);
        updateAvoidance(world);
        applyInput(world);
        dampPlayerMovement(world);
        pushEnemies(world);
        handleShooting(world);
        updateMovement(world);
        updateBullets(world);
        updateBulletCollisions(world);
        updateAutoRotate(world);
        updateSpatialHashing(world);
        cleanupSpatialHashMap(world);
        tickShieldVisibility(world);
        tickExplosion(world);
    });

    // Sync keyboard input to the world
    useEffect(() => {
        const keys = world.get(Keyboard)!;

        const downHandler = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
        const upHandler = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());

        window.addEventListener('keydown', downHandler);
        window.addEventListener('keyup', upHandler);

        return () => {
            window.removeEventListener('keydown', downHandler);
            window.removeEventListener('keyup', upHandler);
        };
    }, []);

    return null;
}
