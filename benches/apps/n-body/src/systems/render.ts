import { Three } from '../main';

export const render = ({ world }: { world: Koota.World }) => {
	const { renderer, scene, camera } = world.resources.get(Three);
	renderer.render(scene, camera);
};
