import { Schedule } from 'directed';
import { World } from 'koota';
import { updateTime } from './update-time';
import { pollInput } from './poll-input';
import { applyInput } from './apply-input';
import { updateMovement } from './update-movement';
import { spawnEnemies } from './spawn-enemies';
import { followPlayer } from './follow-player';
import { updateAutoRotate } from './update-auto-rotate';
import { dampPlayerMovement } from './damp-player-movement';
import { updateAvoidance } from './update-avoidance';
import { updateSpatialHashing } from './update-spatial-hashing';
import { pushEnemies } from './push-enemies';
import { handleShooting } from './handle-shooting';
import { updateBullets } from './update-bullet';
import { updateBulletCollisions } from './update-bullet-collisions';
import { cleanupSpatialHashMap } from './cleanup-spatial-hash-map';

export const schedule = new Schedule<{ world: World }>();

schedule.add(updateTime);
schedule.add(pollInput);
schedule.add(spawnEnemies);
schedule.add(followPlayer);
schedule.add(updateAvoidance);
schedule.add(applyInput);
schedule.add(dampPlayerMovement);
schedule.add(pushEnemies);
schedule.add(handleShooting);
schedule.add(updateMovement);
schedule.add(updateBullets);
schedule.add(updateBulletCollisions);
schedule.add(updateAutoRotate);
schedule.add(updateSpatialHashing);
schedule.add(cleanupSpatialHashMap);

schedule.build();
