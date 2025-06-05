import type { World } from 'koota';
import { AutoRotate, Time, Transform } from '../traits';

export const updateAutoRotate = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	world.query(Transform, AutoRotate).updateEach(([{ rotation }, autoRotate]) => {
		rotation.x = rotation.y += delta * autoRotate.speed;
	});
};
