import { createActions } from 'koota';
import { IsPlayer } from './traits';

export const actions = createActions((world) => ({
	spawnPlayer: () => world.spawn(IsPlayer),
}));
