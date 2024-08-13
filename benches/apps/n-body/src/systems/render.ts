import { World } from '@sweet-ecs/core';
import { Three } from '../main';

export const render = ({ world }: { world: World }) => {
	const { renderer, scene, camera } = world.resources.get(Three);
	renderer.render(scene, camera);
};
