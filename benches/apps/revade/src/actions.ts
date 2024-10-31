import { TraitValue } from 'koota';
import { createActions } from 'koota/react';
import { AutoRotate, Avoidance, Input, IsEnemy, IsPlayer, Movement, Transform } from './traits';

type TransformValue = TraitValue<(typeof Transform)['schema']>;

export const useActions = createActions((world) => ({
	spawnPlayer: (transform?: TransformValue) => {
		return world.spawn(IsPlayer, Movement, Input, Transform(transform));
	},
	spawnEnemy: (transform?: TransformValue) => {
		return world.spawn(IsEnemy, Movement, Transform(transform), AutoRotate, Avoidance);
	},
}));