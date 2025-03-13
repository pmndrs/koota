import {
	createUniverse,
	createWorldFromUniverse,
	Universe,
	createEntityOperations,
} from 'koota/universe';
import { trait, World } from 'koota';

type GameSession = {
	universe: Universe;
	worlds: {
		mainGameWorld: World;
	};
};

const sessions = new Map<string, GameSession>();

function createSession() {
	const randomUUID = crypto.randomUUID();
	const u = createUniverse();
	sessions.set(randomUUID, {
		universe: u,
		worlds: {
			mainGameWorld: createWorldFromUniverse(u),
		},
	});
	return randomUUID;
}

function getSession(uuid: string) {
	const session = sessions.get(uuid);
	if (!session) {
		throw new Error('Not found');
	}
	return session;
}

const Position = trait({ x: 0, y: 0 });

function movePositions(universe: Universe, world: World) {
	const { get } = createEntityOperations(universe);
	world.query(Position).updateEach(([pos]) => {
		pos.x += 1;
		pos.y += 1;
	});
	world.query(Position).forEach((e) => {});
}

const TEST_UNIVERSES_SPAWNED = 10;
function main() {
	const sessionIds: string[] = [];
	for (let i = 0; i < TEST_UNIVERSES_SPAWNED; i++) {
		sessionIds.push(createSession());
	}

	let entityCount = 0;
	for (const id of sessionIds) {
		const gameSession = getSession(id);

		// spawn new thing per-session every second
		setInterval(() => {
			gameSession.worlds.mainGameWorld.spawn(Position);
			entityCount++;
		}, 100);

		// setup-loop per-session
		let lastFrameTime = performance.now();
		requestAnimationFrame(function loop(nowTime) {
			movePositions(gameSession.universe, gameSession.worlds.mainGameWorld);
			requestAnimationFrame(loop);
			console.log('frametime', nowTime - lastFrameTime, 'entities', entityCount);
			lastFrameTime = nowTime;
		});
	}
}

main();
