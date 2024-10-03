import { Three } from '../main';

export const render = ({ world }: { world: Koota.World }) => {
	const { renderer, scene, camera } = world.get(Three);
	renderer.render(scene, camera);
};
