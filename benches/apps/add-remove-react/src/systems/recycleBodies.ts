import { Position, Circle, Mass, Velocity, Color, CONSTANTS } from '@sim/add-remove';
import { BodySpawner } from '../App';
import { SpawnId } from '../components/SpawnId';

let draining = true;

export const recycleBodies = ({ world }: { world: Koota.World }) => {
	const eids = world.query(Position, Circle, Mass, Velocity, Color, SpawnId);
	const [position, spawnId] = world.get(Position, SpawnId);

	if (eids.length === 0) draining = false;
	if (eids.length > CONSTANTS.BODIES * 0.95) draining = true;

	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];

		if (position.y[eid] < CONSTANTS.FLOOR) {
			// Remove entity
			BodySpawner.queueDestroy(spawnId.value[eid]);

			if (!CONSTANTS.DRAIN) BodySpawner.queueSpawn();
		}
	}

	if (CONSTANTS.DRAIN) {
		const target = Math.min(
			Math.max(CONSTANTS.BODIES * 0.01, eids.length * 0.5),
			CONSTANTS.BODIES - eids.length
		);

		if (!draining) {
			for (let i = 0; i < target; i++) {
				BodySpawner.queueSpawn();
			}
		}
	}

	BodySpawner.processQueue();
};
