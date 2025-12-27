import type { World } from 'koota';
import { Three } from '../main';

export const render = ({ world }: { world: World }) => {
	const { renderer, scene, camera } = world.get(Three)!;
	renderer.render(scene, camera);
};
